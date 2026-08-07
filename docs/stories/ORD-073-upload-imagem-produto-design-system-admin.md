---
id: ORD-073
status: Done
fase: 5
sprint: null
responsavel: Backend SR + Frontend
estimativa: 8 pontos
---

# ORD-073 — Upload de imagem de produto (MinIO/S3) + migração do admin pro design-system

## Descrição
Uma sessão anterior tinha começado o upload de imagem de produto no catalog-service e parado no meio, com tudo implementado mas não commitado direto em `main` (sem branch de sprint, sem história — nunca passou pelo gate `Ready`). Recuperado nesta sessão: o trabalho já estava praticamente completo e coerente (backend + frontend), só faltava cobertura de teste, alguns bugs de integração e formalização.

O upload de imagem veio empacotado com uma frente maior: o `CatalogScreen.tsx` foi reescrito usando um **pacote `design-system` vendorizado localmente** (`frontend/admin/vendor/design-system`), o que arrastou consigo a migração de praticamente toda `frontend/admin/src/` pro mesmo design system (Sidebar, App.tsx, todas as telas) — daí o escopo desta história ser maior que só "upload de imagem".

> **Nota de processo:** história escrita retroativamente. O trabalho foi recuperado do working tree (não commitado), completado, testado e validado ao vivo nesta sessão, sem passar pelo fluxo upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes de codar — decisão explícita do usuário pra não perder o trabalho já pronto. Ver [[project_ordin_roadmap]].

## Persona
**Owner/Manager da empresa** — cadastra produtos no catálogo e precisa que o cliente veja uma foto do item no totem antes de pedir, não só nome e preço.

## Contexto

### Storage: mesmo padrão do ORD-071 (contratos)
`services/catalog/infrastructure/image_storage.py` segue exatamente o padrão do `contract_storage.py` do company-service — MinIO em dev (compatível com API S3, mesmo client `boto3`), S3 real em produção. Banco guarda a **key** do objeto, nunca URL (URLs assinadas expiram, geradas sob demanda). Bucket próprio (`ordin-catalog`, env var `S3_BUCKET_CATALOG` separada da de contratos) pra não vazar override um do outro.

### Bug real encontrado ao vivo: Nginx rejeitando upload de imagem sem erro visível
Depois de testar com uma imagem de 1.1MB, o upload falhava silenciosamente ("Erro no envio" genérico, nada nos logs do `catalog-service`). Causa: **nenhum dos dois Nginx que a requisição atravessa** (o do próprio `admin` e o do gateway) tinha `client_max_body_size` configurado — o padrão do Nginx é 1MB, abaixo do limite de 2MB da aplicação. A requisição era rejeitada com 413 na primeira camada (Nginx do `admin`), antes de sequer chegar no `catalog-service` — por isso os logs do backend não mostravam nada. Corrigido com `client_max_body_size 3m;` nos dois `nginx.conf`.

### Bug real encontrado ao vivo: toast de erro nunca aparecia
Testando o limite de tamanho manualmente, nenhuma mensagem de erro aparecia na tela ao subir um arquivo grande — nem sucesso nem erro, silêncio total. Causa: o `<ToastContainer />` do design-system (usado por `makeToast()` internamente pelo componente `Upload`, via `react-hot-toast`) nunca estava montado em `App.tsx`. Todo `makeToast(...)` de qualquer componente do DS rodava no vazio. Corrigido montando `<ToastContainer />` uma vez no topo do `App.tsx`, cobrindo login e área autenticada.

### Duas armadilhas de CSS do design-system (documentadas em [[project_ordin_design_system_gotchas]])
- Ícone de upload encavalando o texto "Clique aqui": o reset global `* { box-sizing: border-box }` do admin conflitava com o CSS do DS (`width` + `padding` do ícone assumindo `content-box`). Corrigido restaurando `content-box` só pros ícones do DS.
- `Button` do design-system **descarta silenciosamente `className`** passado por fora (`Button.js` espalha `{...props}` antes de sobrescrever `className` com o próprio cálculo) — usar `style` inline em vez de CSS module class pra qualquer ajuste visual num `Button`.

### Mensagem de erro de tamanho "estranha"
O `Upload` do DS monta a mensagem de limite de tamanho como `` `Utilize arquivos com menos de ${maxFileSize} MB` `` direto a partir do valor numérico passado — não dá pra customizar o texto. Um valor fracionário (ex: 500KB como `500/1024` MB) virava `"0.48828125 MB"` na tela. Resolvido usando um valor redondo em MB (`2`) tanto no limite quanto na mensagem — 2MB no lugar do 500KB/250KB inicial, por pedido do usuário.

## Explorer

### Fluxo principal
1. Owner/manager abre "Editar" num produto → vê a área de upload (JPG/PNG, até 2MB)
2. Sobe uma imagem → preview aparece imediatamente (thumbnail 200x200 gerado no backend via Pillow) → pode remover e subir outra
3. Clica na miniatura (na listagem ou no formulário de edição) → abre modal com a imagem em tamanho maior (600px de largura, altura proporcional)
4. Também é possível trocar a categoria do produto direto no formulário de edição (Dropdown de categorias ativas)

### Critérios de aceite
- [x] Upload aceita JPG/PNG até 2MB, rejeita outros formatos (415) e arquivos corrompidos (422)
- [x] Gera thumbnail (200x200) automaticamente
- [x] Re-upload substitui a imagem anterior sem deixar objeto órfão no bucket
- [x] Remover imagem limpa os dois objetos (original + thumbnail) do bucket
- [x] Excluir produto permanentemente também limpa a imagem do bucket (ver ORD-074)
- [x] Erro de tamanho/formato aparece visível pro usuário (toast) — não falha silenciosamente
- [x] Clicar na miniatura abre preview em modal, sem barra de rolagem horizontal
- [x] Campo de upload ocupa a largura total do formulário, igual aos outros inputs
- [x] Troca de categoria do produto via Dropdown, sem editar categoria e produto em telas separadas
- [x] Nome/Preço na mesma linha nos formulários de produto (otimização de espaço)
- [x] Botões "Desativar"/"Ativar" não mudam de tamanho ao alternar (largura fixa, mesmo problema em categoria e produto)

## QA Explorer

```gherkin
Feature: Upload de imagem de produto

  Scenario: Upload de imagem válida
    Dado um produto com categoria definida
    Quando envio um JPG de 1.1MB
    Então recebo 200 com image_url e thumbnail_url preenchidos

  Scenario: Arquivo maior que o limite
    Quando envio um arquivo maior que 2MB
    Então recebo 413 e uma mensagem de erro visível na tela

  Scenario: Produto sem categoria
    Dado um produto com category_id nulo
    Quando tento subir uma imagem
    Então recebo 400 (não dá pra montar o caminho da imagem sem categoria)

  Scenario: Re-upload não deixa lixo no bucket
    Dado um produto com imagem em .jpg
    Quando envio uma nova imagem em .png
    Então o objeto .jpg antigo não existe mais no bucket
```

Validado ao vivo no navegador (não só testes automatizados — ver [[feedback_verificacao_ao_vivo]]): os dois bugs reais desta história (Nginx 413 silencioso, toast que nunca aparecia) só apareceram testando de verdade, não em teste automatizado ou leitura de código.

**Suíte automatizada:** `test_upload_imagem.py` — 15 casos (sucesso jpg/png, produto sem categoria, produto inexistente/de outra empresa, tipo inválido, tamanho excedido, arquivo corrompido, permissão, re-upload sem lixo órfão, remoção idempotente). Suíte completa do catalog-service: **59 passed**, sem regressão.

## Tech Explorer

### Serviços impactados
- **`services/catalog/infrastructure/image_storage.py`** — novo módulo, mesmo padrão do `contract_storage.py` (ORD-071)
- **`services/catalog/main.py`** — `Product.thumbnail_url`, endpoints `POST/DELETE /catalog/products/{id}/image`, `Dropdown` de categoria embutido na edição, filtro `include_inactive` em categorias/produtos
- **`services/catalog/migrations/versions/20260807_0900_thumbnail_url.py`**
- **`services/catalog/requirements.txt`** — `boto3`
- **`docker-compose.yml`** — catalog-service ganha env vars S3 (bucket próprio) e `depends_on: minio`
- **`nginx.conf`** (raiz) e **`frontend/admin/nginx.conf`** — `client_max_body_size 3m`
- **`frontend/admin/vendor/design-system/`** — pacote novo vendorizado (dependência `file:`)
- **`frontend/admin/src/App.tsx`** — `<ToastContainer />` montado
- **`frontend/admin/src/styles/theme.scss`** — fix de `box-sizing` pros ícones do DS
- **`frontend/admin/src/screens/CatalogScreen.tsx`** e **`.module.scss`** — reescrita completa: upload, preview modal, dropdown de categoria, layout nome+preço
- **`frontend/admin/src/components/ConfirmDialog.tsx`** — substitui `window.confirm()` nativo pelo `Modal` do DS
- Praticamente todas as outras telas do admin migraram pro design-system no mesmo esforço (Sidebar, Dashboard, Orders, Payments, Company*, Login, Settings, Pair) — arrastadas pela mesma dependência nova, não é escopo funcional novo em si

### Riscos
- Pacote `design-system` vendorizado localmente (não é dependência npm publicada) — atualizações futuras do design system precisam ser copiadas manualmente pro `vendor/`
- `Button` descartar `className` é uma limitação do pacote vendorizado, não corrigível sem editar o `dist/` (frágil); documentado em [[project_ordin_design_system_gotchas]] pra não repetir a investigação

### Estimativa
8 pontos — recuperação de trabalho não commitado + dois bugs reais só descobertos em teste ao vivo (Nginx, Toast) + escopo inflado pela migração de design system em cascata.

---

## Ready

**Explorer:** [x] fluxo de upload e preview validados · **QA Explorer:** [x] 15 testes automatizados + validação manual real (bugs de Nginx e Toast só apareceram ao vivo) · **Tech Explorer:** [x] serviços, riscos e dependência vendorizada documentados · **Aprovação final:** aprovado no chat pelo usuário, incluindo autorização explícita pra pular o upstream de pré-implementação dado o trabalho já estar pronto.

**Status: Done** — aplicado, testado (automatizado + manual real) e rodando em ambiente local. Escrita retroativamente.
