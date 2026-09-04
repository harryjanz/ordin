---
id: ORD-133
status: Done
fase: 4
sprint: null
responsavel: Backend SR + Frontend
estimativa: 6 pontos
---

# ORD-133 — MP Device ID como select (consulta ao Mercado Pago) + validação de terminal duplicado entre totens

## Descrição
Em **Empresa > Terminais** (`frontend/admin/src/screens/CompanyScreen.tsx`), o campo "MP Device ID" é hoje um input de texto livre preenchido manualmente pelo admin. Precisa virar um **select**, carregado consultando `GET /terminals/v1/list` na API do Mercado Pago (autenticado com o `access_token` já configurado em `company_payment_configs` da empresa) — o admin escolhe entre os terminais Point realmente vinculados à conta MP, em vez de digitar o ID à mão.

Motivação direta: o formato exigido pela API de Orders do MP é `{tipo_terminal}__{serial}`, exatamente como retornado por `GET /terminals/v1/list`. Um valor digitado errado faz a order nunca chegar automaticamente na maquininha.

Segundo requisito: hoje não existe validação de unicidade — o mesmo `mp_device_id` pode ser salvo em dois terminais/totens diferentes sem nenhum aviso, fazendo dois totens competirem pelo mesmo dispositivo físico.

## Persona
**Admin da empresa** — configura terminais em Empresa > Terminais.

## Contexto
Nasceu de uma investigação sobre por que a maquininha MP Point não estava recebendo pedidos automaticamente. Depois de esgotar as causas de infraestrutura do MP (Wi-Fi, firmware, pareamento), ficou claro que o vetor de erro mais provável nesse tipo de configuração é humano: digitar o `mp_device_id` errado ou reaproveitar sem querer o mesmo terminal em dois totens.

---

## Explorer

## História
Como **admin da empresa configurando terminais em Empresa > Terminais**, quero escolher o "MP Device ID" de uma lista carregada diretamente da conta Mercado Pago da empresa, e ser avisado se tentar reaproveitar um terminal Point já configurado em outro totem, para eliminar erro de digitação e conflito de dispositivo antes que virem falha silenciosa no pagamento.

### Fluxo principal
1. Admin abre Empresa > Terminais e clica em "Novo terminal" ou "Editar"
2. Modal abre; campo "MP Device ID" aparece como select, com estado de carregamento
3. Frontend chama endpoint do company-service que consulta `GET /terminals/v1/list` na API MP usando o `access_token` de `company_payment_configs`
4. Select é populado com os terminais retornados
5. Admin escolhe e salva
6. Backend valida que o `mp_device_id` não está em uso por outro terminal ativo da mesma empresa antes de gravar
7. Se passar, salva; se não, retorna erro de conflito

### Fluxos alternativos / exceções
- Empresa sem MP configurado: select vazio com mensagem explicativa, não trava o resto do formulário
- Consulta ao MP falha: select com erro + retry + modo manual de fallback (com validação de formato)
- Terminal já em uso por outro totem ativo da mesma empresa: rejeitado ao salvar, mensagem nomeando o conflitante
- Editando o próprio terminal sem trocar o device: não dispara conflito
- Terminal conflitante inativo: não bloqueia
- Select sinaliza visualmente terminais em uso (desabilitados)

### Dependências
- Serviços envolvidos: company-service (endpoint novo + validação), frontend/admin. payment-service não muda.
- Sem histórias bloqueantes.

### Critérios de aceite funcionais
- [x] Campo é select, populado com terminais reais do MP
- [x] Terminais em uso por outro terminal ativo aparecem desabilitados
- [x] Salvar device em uso por outro ativo é rejeitado com mensagem nomeando o conflitante
- [x] Editar mantendo o próprio device não é bloqueado
- [x] Desativar o conflitante libera o device
- [x] Empresa sem MP vê mensagem explicativa
- [x] Falha na consulta MP não trava o formulário — fallback manual disponível

### Wireframe / Mockup
Sem mockup visual — `InputBase` atual substituído por `Dropdown` do design system (mesmo componente já usado no campo "Ambiente"), mesma posição no formulário, com 4 estados visuais (carregando, populado com itens desabilitados, vazio, erro).

---

## QA Explorer

```gherkin
Feature: MP Device ID como select consultado do Mercado Pago + validação de terminal duplicado
  Como admin da empresa
  Quero escolher o terminal Point de uma lista real e ser avisado de conflitos
  Para eliminar erro de digitação e disputa de dispositivo entre totens

  Background:
    Dado que a empresa 1 (Burger House) tem Mercado Pago configurado e ativo
    E a conta MP da empresa 1 tem os terminais "PAX_Q92__Q92-1734060436" e "PAX_A910__SMARTPOS999" vinculados

  Scenario: Select é populado com os terminais reais da conta MP
    Quando o frontend consulta o endpoint de terminais MP da empresa 1
    Então o select mostra os dois terminais como opções, nenhum desabilitado

  Scenario: Criar terminal com device disponível é aceito
    Quando o admin cria "Totem 3" com mp_device_id="PAX_Q92__Q92-1734060436"
    Então o terminal é salvo com sucesso

  Scenario: Select sinaliza visualmente um terminal já em uso
    Dado que "Totem 1 - Entrada" já usa "PAX_Q92__Q92-1734060436"
    Quando o admin abre o modal de novo terminal
    Então a opção "PAX_Q92__Q92-1734060436" aparece desabilitada, indicando "já usado em Totem 1 - Entrada"

  Scenario: Criar terminal com device já em uso por outro terminal ativo é rejeitado
    Dado que "Totem 1 - Entrada" já usa "PAX_Q92__Q92-1734060436"
    Quando o admin tenta criar "Totem 4" com o mesmo device
    Então a resposta é 409 com mensagem "Este terminal Point já está configurado em 'Totem 1 - Entrada'. Escolha outro ou desative o outro terminal primeiro."

  Scenario: Editar terminal para usar device já em uso por outro é rejeitado
    Dado "Totem 1" usa device A e "Totem 2" usa device B
    Quando o admin edita "Totem 2" tentando trocar pro device A
    Então a resposta é 409 e "Totem 2" mantém device B

  Scenario: Editar terminal mantendo seu próprio device não é bloqueado
    Quando o admin edita "Totem 1 - Entrada" alterando só o label, mantendo o mesmo device
    Então a edição é aceita normalmente

  Scenario: Desativar o terminal conflitante libera o device
    Dado "Totem 1 - Entrada" (ativo) usa device A
    Quando o admin desativa "Totem 1 - Entrada" e cria "Totem 5" com device A
    Então "Totem 5" é criado com sucesso

  Scenario: Empresa sem Mercado Pago configurado vê mensagem explicativa
    Quando o admin da empresa 2 (sem config MP ativa) abre o modal de novo terminal
    Então o select mostra "Configure o Mercado Pago em Pagamentos antes de vincular um terminal Point"

  Scenario: Falha ao consultar a API do Mercado Pago não trava o formulário
    Dado que GET /terminals/v1/list falha
    Quando o admin abre o modal
    Então aparece erro + botão retry + modo manual de fallback

  Scenario: Modo manual de fallback ainda valida o formato do device_id
    Quando o admin digita "SMARTPOS123" (sem prefixo) no modo manual
    Então a resposta é 400

  Scenario: Isolamento multi-tenant — mesmo texto de device_id em empresas diferentes não é conflito
    Dado que a empresa 1 e a empresa 2 têm contas MP distintas
    Quando a empresa 2 cria um terminal com o mesmo texto de device_id que a empresa 1 usa
    Então a criação é aceita (checagem escopada por company_id)

  Scenario: Acesso de admin de outra empresa ao endpoint retorna 403
    Quando um admin da empresa 2 consulta o endpoint de terminais MP da empresa 1
    Então a resposta é 403
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **company-service**: endpoint novo `GET /companies/{company_id}/mp-terminals`, validação em `create_terminal`/`update_terminal`.
- **frontend/admin**: `CompanyScreen.tsx` — `Dropdown` controlado substituindo `InputBase`.
- **payment-service**: sem mudança.

### Endpoints
- `GET /companies/{company_id}/mp-terminals` — retorna `{configured, terminals: [{id, operating_mode, in_use_by}]}`; 502 se a consulta ao MP falhar.
- `POST/PUT /companies/{company_id}/terminals` — adiciona `_validate_mp_device_format` (400) e `_check_mp_device_conflict` (409, exclui o próprio terminal na edição).

### Migrations
Nenhuma — validação em nível de aplicação, sem `UNIQUE` de banco (regra permite duplicar entre inativo/ativo e entre empresas).

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum.

### Frontend
Estados novos: `mpTerminals`, `mpTerminalsStatus` (idle/loading/loaded/error/not_configured), `mpDeviceId` (controlado), `mpManualMode`. `Dropdown` reaproveitado do campo "Ambiente"; fallback mantém o `InputBase` não-controlado de hoje.

### Estimativa
- Backend: 3 pontos. Frontend: 3 pontos. **Total: 6 pontos.**

### Riscos
- Baixo — latência ao abrir modal (chamada externa síncrona), mitigada por loading state.
- Baixo — race condition em validação de aplicação (não-constraint), aceitável pra fluxo administrativo de baixa concorrência.
- Baixo — paginação do MP não tratada (assume poucos terminais por empresa hoje), débito técnico não bloqueante.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História Como/Quero/Para
- [x] Contexto e motivação documentados
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas
- [x] Wireframe descrito (sem mockup visual)
- [x] Critérios de aceite funcionais

**QA Explorer (QA)**
- [x] Happy path em Gherkin
- [x] Cenários de borda (auto-conflito no edit, terminal inativo, empresa sem MP)
- [x] Cenários de erro (consulta MP falha, formato inválido)
- [x] Isolamento multi-tenant incluído
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados
- [x] Endpoints com payload request/response
- [x] Migrations descritas (nenhuma, com justificativa)
- [x] Eventos de fila (nenhum aplicável)
- [x] Estimativa definida (6 pontos)
- [x] Riscos identificados

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica ("aprovado, seguimos em frente")
- [x] Estimativa acordada
- [x] Sem bloqueios não resolvidos
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.
