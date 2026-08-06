---
id: ORD-060
status: Done
fase: 4
sprint: null
responsavel: Frontend
estimativa: 8 pontos
---

# ORD-060 — Tela de cadastro de cliente no admin panel

## Descrição
Os endpoints de cadastro de cliente (ORD-056 a 059 — dados cadastrais + CNPJ validado, consulta Receita Federal, contatos + responsável legal criptografados, status do contrato) estão implementados no `company-service` (PR #25), mas **não existe nenhuma tela no admin panel** para usá-los — hoje o único jeito de cadastrar uma empresa é via `curl`/Swagger. Esta história cria o fluxo de UI completo: um wizard de cadastro e uma tela de detalhe/acompanhamento de contrato.

## Persona
**Super admin**, mesmo usuário que hoje precisa usar `curl` ou o Swagger (`/docs`) do company-service pra cadastrar um cliente novo.

## Contexto
Ao validar o fluxo manualmente após implementar o backend, ficou claro que testar via `curl` funciona pra QA de API mas não é como o super admin de fato vai operar isso no dia a dia. Também não existe ainda nenhuma infraestrutura de teste de frontend no projeto (nem unitário, nem E2E) — esta história é a primeira a introduzir isso.

---

## Explorer

## História
Como **super admin**, quero cadastrar um novo cliente pelo admin panel (CNPJ validado com consulta automática à Receita, endereço, contatos, responsável legal) e depois acompanhar o status do contrato (enviado/assinado), para não depender de chamadas manuais à API.

### Contexto e motivação
O levantamento técnico do frontend (`frontend/admin/src/`) encontrou:
- **Nenhuma tela de criação de empresa existe** — `DashboardScreen.tsx` só tem um `<select>` pra trocar o contexto de empresa já cadastrada, não cria nada.
- O tipo `Role` do frontend (`types.ts:1`) **não inclui `"superadmin"`**, apesar do backend já autenticar esse papel corretamente — **confirmado manualmente**: login com `admin@ordin.app`/`admin123` retorna um JWT com `role: superadmin` que já foi usado com sucesso contra `POST /companies`, `GET /companies/cnpj-lookup/{cnpj}` e `PATCH /companies/{id}/contract-status` no ambiente local. Ou seja: o gap é só de tipagem/roteamento no frontend, não de autenticação — a menção a isso como "bloqueador de auth" numa análise anterior estava incorreta.
- Tratamento de erro 422 do FastAPI hoje é fraco: só a aba de Pagamento em `CompanyScreen.tsx:264-281` trata `err.response.data.detail`, e só como string única — o formato real de erro de validação Pydantic é uma **lista** de erros por campo (`{"detail":[{"loc":[...],"msg":...}]}`). Esta história precisa de um parser genérico, não copiar o padrão fraco existente.
- Não existe padrão de upload de arquivo em nenhuma tela hoje — vai ser o primeiro precedente (upload do PDF assinado do contrato, ORD-059).
- Não existe lib de máscara de input (CNPJ/CPF/CEP) nem de formulário/validação no `package.json`.

### Personas afetadas
- **Super admin**: opera o cadastro por essa tela em vez de API direta
- **QA**: ganha um fluxo E2E de verdade pra validar (hoje zero testes de frontend existem)

### Fluxo principal
Ver wireframe publicado: **[ORD-060 — Cadastro de cliente (wireframe)](https://claude.ai/code/artifact/12506aea-886e-45a4-87a8-aa03c5809b7b)** — inclui os dois modos (wizard de cadastro e tela de detalhe/contrato), usando o design system real do admin (`themes.ts`, tema `ordin`: roxo `#9900ff`, fundo `#0e0b1a`/`#1d1434`, fontes Lexend/Inter/Courier New já declaradas em `PairScreen.tsx`).

1. Super admin acessa "Empresas → Novo cliente" (item de menu hoje inexistente para a role `superadmin`)
2. **Passo 1 — Dados cadastrais**: digita CNPJ → dispara `GET /companies/cnpj-lookup/{cnpj}` (debounce) → preenche razão social/nome fantasia/situação automaticamente; se `found=false, reason=lookup_unavailable`, libera preenchimento manual sem travar
3. **Passo 2 — Endereço**: já vem preenchido pela consulta, editável
4. **Passo 3 — Contatos**: comercial obrigatório, financeiro/técnico opcionais (adicionados sob demanda)
5. **Passo 4 — Responsável legal**: nome, CPF (validado client-side), cargo, e-mail, telefone
6. **Passo 5 — Revisão**: resumo com atalho "Editar" pra cada seção → `POST /companies` (reconsulta situação no servidor, como já implementado) → exibe o PIN gerado
7. Depois de criado, super admin acessa a **tela de detalhe**: cabeçalho da empresa + tracker de 3 estágios do contrato (Pendente → Enviado → Assinado) + upload do PDF assinado (`PATCH /companies/{id}/contract-status`)

### Fluxos alternativos / exceções
- CNPJ com situação cadastral diferente de "ATIVA" → alerta bloqueante no passo 1, não deixa avançar
- Erro 422 de qualquer step (ex: CPF inválido no passo 4) → mensagem no campo específico, não um alerta genérico
- Marcar contrato como "assinado" sem anexar PDF → botão desabilitado no client, sem nem chamar a API (a API já rejeita com 422, mas o client deve prevenir isso antes)
- Usuário sem role `superadmin` → item de menu "Empresas" nem aparece (mesmo padrão de `Sidebar.tsx` já usado pros outros menus)

### Dependências
- Serviços envolvidos: `frontend/admin` apenas — consome API já pronta
- **Histórias bloqueantes: ORD-056, ORD-057, ORD-058, ORD-059 (PR #25) precisam estar mergeadas em `main` antes desta história começar** — os endpoints reais precisam existir na branch de trabalho
- Wireframe: publicado como Artifact (link acima)

### Critérios de aceite funcionais
- [ ] Wizard completo (5 passos) cria uma empresa de ponta a ponta, com CNPJ validado e consultado
- [ ] Situação cadastral inativa bloqueia o avanço, mostrando o motivo
- [ ] Contatos (comercial obrigatório) e responsável legal (CPF validado) são cadastrados
- [ ] Tela de detalhe mostra o tracker de contrato e permite marcar enviado/assinado (com upload obrigatório no caso de assinado)
- [ ] Erros 422 do backend aparecem no campo correto, não como alerta genérico
- [ ] Menu "Empresas" só aparece para `superadmin`
- [ ] Cobertura de teste: unitário/componente (happy path do wizard) + E2E (fluxo completo login → cadastro → detalhe → contrato)

---

## QA Explorer

```gherkin
Feature: Cadastro de cliente no admin panel
  Como super admin
  Quero cadastrar um cliente pelo admin panel com CNPJ validado, contatos e responsável legal
  Para não depender de chamadas manuais à API

  Background:
    Dado que estou logado no admin panel como super admin

  Scenario: Cadastro completo do wizard (happy path)
    Dado que estou na tela "Novo cliente"
    Quando preencho CNPJ "11.222.333/0001-81" no passo 1
    Então razão social, nome fantasia e situação "ATIVA" são preenchidos automaticamente
    Quando avanço pelos passos 2 a 5 confirmando os dados
    E clico em "Criar cadastro"
    Então a empresa é criada e o PIN gerado é exibido
    E a tela de detalhe mostra o contrato com status "Pendente"

  Scenario: CNPJ com situação inativa bloqueia o avanço
    Dado que digito um CNPJ cuja consulta retorna situação "BAIXADA"
    Então um alerta bloqueante aparece no passo 1
    E o botão "Continuar" fica desabilitado

  Scenario: CNPJ alfanumérico sem suporte na API não trava o cadastro
    Dado que digito um CNPJ alfanumérico cuja consulta retorna "lookup_unavailable"
    Então um aviso não-bloqueante aparece
    E consigo preencher os campos manualmente e continuar

  Scenario: Erro de validação aparece no campo certo
    Dado que informo um CPF inválido no passo "Responsável legal"
    Quando tento avançar
    Então a mensagem de erro aparece embaixo do campo CPF, não como alerta genérico de topo

  Scenario: Contato comercial é obrigatório
    Dado que não preencho o contato comercial no passo 3
    Quando tento avançar
    Então o avanço é bloqueado com indicação de que o contato comercial é obrigatório

  Scenario: Marcar contrato como assinado exige anexo
    Dado que estou na tela de detalhe com contrato "Enviado"
    Quando clico em "Marcar como assinado" sem selecionar um arquivo
    Então o botão de confirmar permanece desabilitado

  Scenario: Menu "Empresas" só aparece para superadmin
    Dado que estou logado como "owner" (não superadmin)
    Quando olho o menu lateral
    Então não existe a opção "Empresas / Novo cliente"

  Scenario: Isolamento — rota bloqueada por role no client
    Dado que estou logado como "owner"
    Quando acesso diretamente a URL da tela de cadastro de empresa
    Então sou redirecionado, mesmo sem clicar no menu

  Scenario: E2E completo (Playwright)
    Dado o ambiente local rodando via docker compose
    Quando executo o fluxo: login superadmin → novo cliente → 5 passos → criar → detalhe → marcar enviado → marcar assinado com upload
    Então cada etapa é validada com screenshot
    E as evidências ficam salvas em docs/stories/ORD-060/evidencias/e2e/
```

**Aprovado pelo PM.** Cenário mais crítico pro QA: erro de validação por campo (hoje o admin não tem NENHUM precedente disso funcionando direito) e o E2E completo, que é o primeiro do projeto.

---

## Tech Explorer

### Serviços impactados
- **frontend/admin** apenas. Nenhuma mudança de backend nesta história (endpoints já existem via PR #25).

### Correções prévias necessárias (bloqueiam o resto da história)
1. `frontend/admin/src/types.ts:1` — `Role` precisa incluir `"superadmin"`:
   ```ts
   export type Role = "superadmin" | "admin" | "owner" | "manager" | "cashier";
   ```
2. `App.tsx` (`ROLE_ROUTES`) e `Sidebar.tsx` (`MENU[...].roles`) precisam reconhecer `superadmin` e liberar a nova rota `/companies/new` e `/companies/:id/onboarding` (ou nome equivalente) só para essa role.

### Novos arquivos

```
frontend/admin/src/
  api/companies.ts          → client centralizado (lookupCnpj, createCompany,
                               createContact, listContacts, upsertLegalRep,
                               getLegalRep, updateContractStatus) — hoje cada
                               screen chama api.get/post direto, esta história
                               introduz o primeiro client de domínio
  lib/validators.ts          → is_valid_cnpj / is_valid_cpf / is_valid_cep em TS,
                               espelhando services/company/domain/{cnpj,cpf,address}.py
                               — validação client-side instantânea sem round-trip
  lib/masks.ts                → formatCnpj/formatCpf/formatCep (aplicação de máscara
                               visual only — o payload enviado ao backend já vem
                               sem máscara, o próprio backend também normaliza)
  lib/apiErrors.ts             → parser genérico do formato FastAPI 422
                               ({"detail": [{"loc": [...], "msg": ...}]} vs
                               {"detail": "string"}) — hoje só existe tratamento
                               de string única (CompanyScreen.tsx:264-281)
  screens/NewCompanyScreen.tsx  → wizard de 5 passos
  screens/CompanyContractScreen.tsx → tela de detalhe + tracker de contrato + upload
  components/Stepper.tsx         → navegação do wizard (reaproveitável)
```

### Contrato de API consumido (já implementado, sem mudanças)
```
GET   /companies/cnpj-lookup/{cnpj}
POST  /companies
POST  /companies/{id}/contacts
GET   /companies/{id}/contacts
POST  /companies/{id}/legal-representative
GET   /companies/{id}/legal-representative
PATCH /companies/{id}/contract-status   (multipart quando status="assinado")
```

### Máscara e validação
Reaproveitar a lógica dos módulos Python já testados (`domain/cnpj.py`, `domain/cpf.py`, `domain/address.py`) reimplementada em TS — mesmo algoritmo (`ord(char)-48` mod 11 pro CNPJ, mod 11 clássico pro CPF), evitando duplicar regra de negócio inconsistente entre client e servidor. O servidor continua sendo a fonte de verdade (revalida tudo), o client só dá feedback mais rápido.

### Upload de arquivo
Primeiro precedente do projeto: `<input type="file">` + `FormData`, `axios.patch(..., formData, {headers: {"Content-Type": "multipart/form-data"}})`, compatível com o endpoint `PATCH /companies/{id}/contract-status` já implementado.

### Testes — infraestrutura nova (zero existente hoje)
- **Unitário/componente**: Vitest + React Testing Library (Vitest por já usar Vite, evita configurar Jest do zero num projeto Vite). Cobrir: validação de CNPJ/CPF client-side, parser de erro 422, navegação do stepper.
- **E2E**: Playwright, configurado do zero em `frontend/admin/`. Segue a regra de evidências já fixada no workflow (`docs/roles/qa.md`): `outputDir` do `playwright.config.ts` aponta pra `docs/stories/ORD-060/evidencias/e2e/` via variável `ORD_ID=ORD-060`.

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável.

### Estimativa
- Frontend: 8 pontos — escopo grande (wizard completo + tela de contrato + upload + 2 frameworks de teste novos + correção de gap de Role). **Risco de tamanho**: se o time achar grande demais pra uma sprint, o corte natural é (a) UI do wizard + detalhe, (b) infraestrutura de teste (Vitest + Playwright) como história separada — fica registrado aqui como opção, não decidido unilateralmente.

### Riscos
- Introduzir Vitest E Playwright do zero na mesma história é escopo não-trivial de configuração, além do código de produto em si
- Máscara/validação duplicada em TS e Python é uma fonte potencial de divergência futura se um dos dois lados for alterado sem replicar no outro — aceito conscientemente pelo ganho de UX (feedback instantâneo), mas vale registrar como débito de sincronização

---

## Ready

**Explorer:** [x] história, contexto (incluindo correção do gap de Role mal diagnosticado antes), fluxo completo, wireframe publicado · **QA Explorer:** [x] happy path, bloqueio por situação inativa, degradação por CNPJ alfanumérico, erro de campo, contato obrigatório, upload obrigatório, isolamento por role, E2E completo com evidências · **Tech Explorer:** [x] arquivos novos, contrato de API, estratégia de teste (Vitest + Playwright do zero), riscos de escopo e de duplicação de validação documentados · **Aprovação final:** [x] solução técnica definida, estimativa 8 pontos com ressalva de tamanho — pendente apenas priorização de sprint e decisão do time sobre quebrar ou não em 2 histórias.

**Status: Ready** — bloqueada tecnicamente até PR #25 (ORD-056 a 059) ser mergeado em `main`.
