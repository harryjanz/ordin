---
id: ORD-071
status: Done
fase: 5
sprint: null
responsavel: Backend SR
estimativa: 5 pontos
---

# ORD-071 — Contratos assinados vão pro S3 (MinIO local / S3 produção), não mais disco do container

## Descrição
Investigando "onde ficam os arquivos de contrato", achamos três problemas em cascata:
1. **Não era armazenamento persistente** — `contract_document_url` apontava pra `/app/uploads/contracts/{id}/...` dentro do próprio container do `company-service`, sem nenhum volume Docker montado. Perdido a cada rebuild/recreate.
2. **Já tinha acontecido** — a Burger House tinha `contract_status="assinado"` com uma URL apontando pra um arquivo que já não existia mais (perdido num dos vários rebuilds da sessão).
3. **Nem tinha como baixar** — nenhuma rota HTTP servia o arquivo de volta, e o frontend nunca usava o campo `contract_document_url` em nenhuma tela.

Resolvido migrando o armazenamento pra S3 — **MinIO em dev local** (compatível com a API do S3, mesmo client `boto3` funciona nos dois ambientes), **S3 real em produção** — e adicionando a rota de download (URL assinada temporária) que faltava.

> **Nota de processo:** história escrita retroativamente, depois da implementação e validação end-to-end (upload → persistência através de recriação total dos containers → download). Não passou pelo fluxo upstream antes de ser codada.

## Persona
**Superadmin** — sobe o PDF do contrato assinado e precisa ter certeza de que ele não vai sumir na próxima vez que alguém reiniciar os serviços; também precisa conseguir baixar o documento depois, não só saber que "está arquivado".

## Contexto

### Por que MinIO e não LocalStack
Perguntado ao usuário: MinIO (foco só em storage compatível com S3, mais leve) vs LocalStack (emula toda a superfície AWS — S3, SQS, SNS, Secrets Manager — mas mais pesado). **Escolhido MinIO**, já que o objetivo imediato é só storage de objetos; se a necessidade de simular SQS/SNS/Secrets Manager localmente aparecer depois (já são alvo documentado em `ARQUITETURA.md`), pode ser revisitado.

### S3 já era o alvo, nunca tinha sido implementado
`docs/ARQUITETURA.md` já menciona S3 duas vezes (KMS pra criptografia em repouso; isolamento de rede) — confirma que já era a intenção, só nunca foi construído. Nenhuma dependência `boto3` existia antes desta história.

### Key no banco, não URL
`contract_document_url` (nome do campo mantido, sem migration de rename pra evitar burocracia desnecessária) agora guarda a **key do objeto** (ex: `contracts/1/contrato.pdf`), nunca uma URL — URLs assinadas do S3 expiram (1h por padrão), então são geradas **sob demanda** a cada consulta via `GET /companies/{id}/contract-document-url`, não persistidas.

### Endpoint interno vs endpoint público (achado durante o teste manual)
Primeira versão gerava a URL assinada usando o mesmo endpoint interno do Docker (`http://minio:9000`) usado pelas chamadas do `company-service` — funciona *entre containers*, mas o navegador de quem clica no link não resolve esse hostname. Corrigido com uma segunda variável, `S3_PUBLIC_ENDPOINT_URL` (`http://localhost:9000` em dev), usada só na hora de gerar a URL assinada; em produção (S3 real, sem endpoint customizado) as duas variáveis ficam vazias e não há distinção nenhuma a fazer.

### Limpeza de dado órfão
Nova migration (`20260806_1800`) zera qualquer `contract_document_url` que comece com `/` (formato antigo de path local) — o arquivo real já não existe em nenhum ambiente, manter o ponteiro seria mostrar "contrato assinado" pra um documento que não pode mais ser baixado.

## Explorer

### Fluxo principal
1. Superadmin marca contrato como "assinado" com upload de PDF → arquivo sobe pro bucket S3/MinIO, banco guarda a key
2. Superadmin volta depois (mesmo depois de reiniciar/recriar todos os containers) → clica em "Baixar contrato assinado" → recebe URL assinada temporária → baixa o PDF intacto

### Critérios de aceite
- [x] Upload de contrato assinado persiste no bucket (`minio_data`, volume Docker nomeado)
- [x] Arquivo sobrevive à recriação total dos containers `minio` + `company-service` (`--force-recreate`) — testado e confirmado
- [x] `GET /companies/{id}/contract-document-url` retorna URL assinada válida, alcançável do navegador (não do nome interno do serviço Docker)
- [x] Botão "Baixar contrato assinado" na tela de contrato do admin, só quando `contract_status === "assinado"`
- [x] Dado órfão (ponteiro pra arquivo local já perdido) limpo via migration
- [x] Bucket criado automaticamente em dev (MinIO); em produção a criação é pulada — bucket é provisionado via Terraform, app não tem permissão de `s3:CreateBucket`

## QA Explorer

```gherkin
Feature: Armazenamento de contratos assinados em S3

  Scenario: Contrato sobrevive a reinício total dos serviços
    Dado que um contrato assinado foi enviado
    Quando os containers minio e company-service são recriados do zero
    Então o arquivo continua acessível pela URL assinada

  Scenario: URL de download é alcançável pelo navegador
    Dado que um contrato assinado existe
    Quando peço a URL de download
    Então a URL usa o endpoint público (localhost), não o nome interno do serviço Docker

  Scenario: Botão de download só aparece com contrato assinado
    Dado que o contrato ainda está pendente ou enviado
    Então o botão "Baixar contrato assinado" não aparece

  Scenario: Dado órfão de armazenamento antigo é limpo
    Dado uma empresa com contract_document_url apontando pra um path local antigo
    Quando a migration de limpeza roda
    Então o campo fica NULL
```

Validado via testes automatizados (moto mockando S3) e, mais importante, **teste real de ponta a ponta**: upload via API → `docker compose up -d --force-recreate minio company-service` → download via URL assinada, confirmando byte a byte que o conteúdo sobreviveu. Também confirmado visualmente no navegador (botão aparece, chamada à API retorna 200 com a URL correta).

## Tech Explorer

### Serviços impactados
- **`docker-compose.yml`** — novo serviço `minio` (healthcheck, volume `minio_data`), env vars S3 no `company-service`, `depends_on: minio (healthy)`
- **`.env` / `.env.example`** — `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `MINIO_ROOT_USER/PASSWORD`, `AWS_REGION`
- **`services/company/infrastructure/contract_storage.py`** — novo módulo: `ensure_bucket()`, `upload_contract()`, `presigned_download_url()`
- **`services/company/main.py`** — `update_contract_status` usa `upload_contract()` em vez de escrever em disco; novo endpoint `GET /companies/{id}/contract-document-url`; `@app.on_event("startup")` chama `ensure_bucket()`
- **`services/company/migrations/versions/20260806_1800_clear_local_contract_paths.py`** — limpa ponteiros órfãos
- **`services/company/requirements.txt`** — `boto3`
- **`services/requirements-dev.txt`** — `moto[s3]` (mock de S3 pros testes)
- **`frontend/admin/src/api/companies.ts`** — `getContractDocumentUrl()`
- **`frontend/admin/src/screens/CompanyContractScreen.tsx`** — botão "Baixar contrato assinado"

### Design: dois endpoints S3, um client
```python
_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")           # interno — put_object, list_buckets
_S3_PUBLIC_ENDPOINT_URL = os.getenv("S3_PUBLIC_ENDPOINT_URL", _S3_ENDPOINT_URL)  # externo — só presigned URL

def presigned_download_url(key, expires_in=3600):
    return _client(endpoint_url=_S3_PUBLIC_ENDPOINT_URL).generate_presigned_url(...)
```

### Testes
- `moto[s3]` mocka o boto3 — achado durante a implementação: moto só intercepta o client quando ele usa o **endpoint padrão da AWS**; com `endpoint_url` customizado (caso do MinIO) ele tenta conectar de verdade e trava. Testes rodam sem `S3_ENDPOINT_URL` setada, igual seria contra o S3 real.
- 2 testes novos (`test_contract_document_url_endpoint_retorna_url_assinada`, `test_contract_document_url_sem_contrato_retorna_404`) + teste existente de upload ajustado pra checar a key exata
- 182/182 testes do company-service passando
- `tsc --noEmit` limpo, 47/47 testes unitários do frontend

### Riscos
- Presigned URLs expiram em 1h — se o superadmin deixar a aba aberta por mais tempo sem recarregar, precisa clicar de novo em "Baixar" (não é bug, é o comportamento esperado de URL assinada)
- Credenciais MinIO (`S3_ACCESS_KEY`/`S3_SECRET_KEY`) fixas no `.env` — aceitável em dev local; em produção o design já prevê IAM role (sem access key/secret key fixas), documentado no código
- `ensure_bucket()` só roda em dev (guardado por `if not _S3_ENDPOINT_URL: return`) — em produção o bucket precisa ser provisionado via Terraform antes do deploy; isso **não está implementado nesta história** (fica como próximo passo natural quando a infra de produção for de fato provisionada)

### Estimativa
5 pontos — módulo novo, dois endpoints (interno/público) descobertos só durante o teste manual real, migração de dado órfão, ajuste de teste pra contornar limitação do moto.

---

## Ready

**Explorer:** [x] decisão MinIO vs LocalStack confirmada com o usuário · **QA Explorer:** [x] validado com teste real de sobrevivência a restart total, não só automatizado · **Tech Explorer:** [x] módulo, endpoints, migração de limpeza, riscos de produção documentados · **Aprovação final:** aprovado no chat pelo usuário.

**Status: Done** — aplicado, testado (automatizado + manual real) e em produção local. História escrita retroativamente. Provisionamento do bucket S3 real em produção (Terraform) fica como pendência futura, fora do escopo desta história.
