---
id: ORD-057
status: Ready
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 5 pontos
---

# ORD-057 — Consulta de CNPJ na Receita Federal: autopreenchimento e bloqueio se situação não-ativa

## Descrição
Com os campos cadastrais e de endereço criados em ORD-056, esta história adiciona a consulta a uma API pública de dados de CNPJ (BrasilAPI, com fallback ReceitaWS) para autopreencher razão social, nome fantasia, endereço e situação cadastral a partir do CNPJ informado — e **bloquear o cadastro** se a situação cadastral não for "Ativa", exatamente como pedido: "caso não esteja ativa não seguimos com o cadastro".

## Persona
**Super admin** cadastrando um novo cliente — reduz digitação manual e evita onboardar CNPJ baixado/inapto/suspenso.

## Contexto
Confirmado com o usuário: "se tiver uma api para verificar situação cadastral na receita podemos implementar também, caso não esteja ativa não seguimos com o cadastro." Como o CNPJ alfanumérico é extremamente recente (primeiro emitido em 2026-08-03, mesma data desta análise), há incerteza real sobre se as APIs públicas gratuitas (BrasilAPI/ReceitaWS) já suportam consulta desse novo formato — isso é tratado como risco técnico explícito, não presumido como resolvido.

---

## Explorer

## História
Como **super admin cadastrando um novo cliente**, quero que o sistema consulte automaticamente a situação do CNPJ na Receita Federal e preencha os dados cadastrais/endereço, bloqueando o cadastro se a empresa não estiver ativa, para evitar erro de digitação e onboarding de empresas irregulares.

### Contexto e motivação
Digitar manualmente razão social e endereço é repetitivo e sujeito a erro — todo ERP consultado no benchmark de mercado faz autopreenchimento por CNPJ. Além disso, como o ordin intermedeia pagamentos (PayGo/Mercado Pago) para as empresas clientes, ativar uma empresa com CNPJ baixado ou inapto é um risco de negócio, não só de dado — daí o bloqueio duro pedido pelo usuário.

### Personas afetadas
- **Super admin**: ganha velocidade no cadastro e um freio automático contra erro
- **Compliance/negócio**: reduz risco de onboarding de empresa irregular

### Fluxo principal
1. Super admin digita o CNPJ no formulário de cadastro (após validação local de ORD-056)
2. Frontend chama `GET /companies/cnpj-lookup/{cnpj}` (novo endpoint auxiliar, não persiste nada)
3. Backend consulta BrasilAPI; se falhar, tenta ReceitaWS como fallback
4. Se a consulta tiver sucesso: retorna razão social, nome fantasia, endereço completo e situação cadastral — frontend preenche os campos, editáveis pelo admin
5. Se `situação cadastral != "ATIVA"`: resposta sinaliza bloqueio, frontend impede de prosseguir com mensagem explicando o motivo
6. Ao submeter o `POST /companies` final (ORD-056), o backend **reconsulta a situação cadastral no servidor** antes de persistir — não confia apenas no que o frontend enviou, evitando janela de tempo entre o lookup e o submit (situação pode mudar, ou o campo pode ser manipulado no client)

### Fluxos alternativos / exceções
- **CNPJ alfanumérico não suportado ainda pela API pública**: sistema não trava o admin — retorna aviso "consulta automática indisponível para este CNPJ, preencha manualmente" e permite prosseguir com preenchimento manual dos campos de ORD-056 (a situação cadastral fica marcada como `"NAO_VERIFICADA"` em vez de bloquear ou assumir "ATIVA")
- **Timeout ou erro da API externa** (rede, rate limit): mesmo tratamento acima — degrada para preenchimento manual, nunca derruba a requisição do admin
- **CNPJ não encontrado na base da Receita**: erro claro "CNPJ não encontrado", cadastro bloqueado (diferente de "situação inativa" — é um erro de dado, não de situação)

### Dependências
- Serviços envolvidos: `company-service` apenas
- Histórias bloqueantes: **ORD-056** (precisa dos campos cadastrais/endereço e do campo `cadastral_status` já existirem na tabela)

### Critérios de aceite funcionais
- [ ] CNPJ numérico existente e ativo → autopreenche razão social, endereço, situação = "ATIVA"
- [ ] CNPJ com situação diferente de "ATIVA" → cadastro bloqueado (422) com a situação encontrada na mensagem
- [ ] CNPJ alfanumérico cuja consulta a API não suporta → degrada para preenchimento manual, não bloqueia nem assume "ativa" por omissão
- [ ] Falha/timeout da API externa não derruba a requisição do admin (erro tratado, resposta clara)
- [ ] Situação cadastral é **reconsultada no servidor** no momento do `POST /companies` final, não apenas confiada do lookup anterior

### Wireframe / Mockup
N/A — comportamento de frontend (preencher campos automaticamente, exibir bloqueio) é responsabilidade de história de frontend futura; esta história entrega o contrato de API.

---

## QA Explorer

```gherkin
Feature: Consulta de CNPJ na Receita Federal com bloqueio por situação cadastral
  Como super admin
  Quero que o CNPJ seja consultado automaticamente e o cadastro bloqueado se a empresa não estiver ativa
  Para evitar erro de digitação e onboarding de empresa irregular

  Background:
    Dado que estou autenticado como super admin

  Scenario: CNPJ numérico ativo é autopreenchido (happy path)
    Dado um CNPJ numérico válido e com situação "ATIVA" na Receita
    Quando chamo GET /companies/cnpj-lookup/{cnpj}
    Então recebo razão social, endereço e situação="ATIVA"

  Scenario: CNPJ com situação inativa bloqueia o cadastro
    Dado um CNPJ numérico válido mas com situação "BAIXADA" na Receita
    Quando tento POST /companies com esse CNPJ
    Então a resposta é 422 informando a situação encontrada
    E nenhuma empresa é criada

  Scenario: CNPJ alfanumérico sem suporte na API externa não trava o admin
    Dado um CNPJ alfanumérico válido localmente (ORD-056) mas que a API de consulta não reconhece/suporta
    Quando chamo GET /companies/cnpj-lookup/{cnpj}
    Então recebo uma resposta indicando "consulta automática indisponível", sem erro 5xx
    E ainda consigo completar o POST /companies preenchendo os campos manualmente
    E o campo cadastral_status fica "NAO_VERIFICADA" (não "ATIVA")

  Scenario: Timeout da API externa não derruba o cadastro
    Dado que a API de consulta de CNPJ está indisponível ou expirando o timeout
    Quando chamo GET /companies/cnpj-lookup/{cnpj}
    Então recebo uma resposta tratada (não 500) indicando indisponibilidade
    E o fluxo de preenchimento manual continua disponível

  Scenario: Reconsulta no submit final pega mudança de situação entre o lookup e o envio
    Dado que o lookup inicial retornou situação "ATIVA"
    E a situação da empresa mudou para "SUSPENSA" na Receita antes do POST final
    Quando envio POST /companies (mesmo que o payload enviado pelo frontend ainda diga "ATIVA")
    Então o backend reconsulta e bloqueia a criação com 422

  Scenario: CNPJ não encontrado na Receita é tratado diferente de situação inativa
    Dado um CNPJ com formato/DV válido mas que não existe na base da Receita
    Quando chamo GET /companies/cnpj-lookup/{cnpj}
    Então recebo 404 com mensagem "CNPJ não encontrado", distinta da mensagem de situação inativa

  Scenario: Endpoint de lookup restrito a super admin
    Dado um usuário com role "owner"
    Quando ele chama GET /companies/cnpj-lookup/{cnpj}
    Então a resposta é 403
```

**Ponto revisado com o PM**: o cenário de CNPJ alfanumérico não suportado é o mais importante de todos porque é o único risco real e não controlável tecnicamente até testarmos a API em produção — QA deve tratar esse cenário como prioridade de teste manual assim que a integração for ao ar, não só como teste automatizado com mock.

---

## Tech Explorer

### Serviços impactados
- **company-service**: novo endpoint de lookup, novo módulo de integração externa, mudança no fluxo de `POST /companies`.

### Endpoints

#### GET /companies/cnpj-lookup/{cnpj}
**Serviço:** company-service
**Auth:** JWT obrigatório | role: `superadmin`

Response 200 (encontrado e verificado):
```json
{
  "found": true,
  "cadastral_status": "ATIVA",
  "legal_name": "string",
  "trade_name": "string",
  "zip_code": "string", "street": "string", "address_number": "string",
  "complement": "string", "neighborhood": "string", "city": "string", "state": "string"
}
```
Response 200 (consulta indisponível — não é erro do cliente):
```json
{ "found": false, "reason": "lookup_unavailable", "cadastral_status": "NAO_VERIFICADA" }
```
Erros: 404 (`cnpj_not_found`), 422 (CNPJ com formato/DV inválido — reaproveita validação de ORD-056), 403

#### POST /companies (alterado)
Antes de persistir, reconsulta a situação cadastral server-side (mesma lógica do lookup). Se `cadastral_status` resultante for diferente de `"ATIVA"` **e** diferente de `"NAO_VERIFICADA"` (ou seja, a Receita respondeu ativamente que não está ativa) → 422. Se a consulta estiver indisponível no momento do submit, permite prosseguir com `cadastral_status = "NAO_VERIFICADA"` (mesma degradação graciosa do lookup).

### Módulo novo
`services/company/infrastructure/cnpj_lookup.py` — segue o padrão já usado em `services/payment/infrastructure/providers/` (client isolado, sem abstração de interface por enquanto já que há só uma "operação"):
- `async def lookup_cnpj(cnpj: str) -> CnpjLookupResult` — tenta BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`) com `httpx.AsyncClient(timeout=10)`; em caso de erro/timeout/4xx≠404, tenta ReceitaWS como fallback; em caso de falha de ambos, retorna resultado com `found=False, reason="lookup_unavailable"` — **nunca propaga exceção**, seguindo o padrão de `paygo.py`/`mercadopago.py` já usado no projeto
- Trata separadamente "CNPJ não encontrado" (404 explícito de ambas as APIs) de "erro/indisponibilidade" (timeout, 5xx, formato de resposta inesperado)

### Migrations
Nenhuma nova — reaproveita `cadastral_status` já criado em ORD-056.

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável.

### Estimativa
- Backend: 5 pontos — maior que o padrão por causa da incerteza real de integração com API externa que talvez não suporte ainda o CNPJ alfanumérico (risco técnico, não só volume de código)

### Riscos
- **Risco não mitigável antecipadamente**: não há confirmação de que BrasilAPI/ReceitaWS já suportam consulta de CNPJ alfanumérico (o formato começou a valer na mesma data desta análise). Recomendação: tratar a fase de desenvolvimento como incluindo um **spike de validação manual** contra a API real antes de fechar a história como concluída — se nenhuma API pública suportar ainda, o comportamento de degradação graciosa (`lookup_unavailable`) vira o caminho principal para CNPJ alfanumérico até as APIs se atualizarem, não uma exceção rara
- Rate limit das APIs gratuitas (BrasilAPI/ReceitaWS) pode exigir cache local ou fila de retry no futuro — fora de escopo aqui, mas vale registrar como débito técnico se o volume de cadastros crescer

---

## Ready

**Explorer:** [x] · **QA Explorer:** [x] happy path, bloqueio por situação, degradação por CNPJ alfanumérico não suportado, timeout, reconsulta no submit, CNPJ não encontrado, isolamento de role · **Tech Explorer:** [x] endpoint, módulo de integração, riscos documentados com plano de mitigação (spike) · **Aprovação final:** [x] solução técnica definida, estimativa 5 pontos, risco técnico registrado e aceito conscientemente pelo time — pendente apenas priorização de sprint.

**Status: Ready** (com ressalva: primeira tarefa do sprint deve ser o spike de validação da API contra CNPJ alfanumérico real, para confirmar se o caminho principal será autopreenchimento ou degradação manual).
