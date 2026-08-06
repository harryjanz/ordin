---
id: ORD-069
status: Done
fase: 5
sprint: null
responsavel: Backend SR / Frontend
estimativa: 5 pontos
---

# ORD-069 — Consulta de CEP resiliente (auto-preenchimento de endereço)

## Descrição
No cadastro/edição de empresa, ao trocar o CEP o usuário precisava preencher logradouro/bairro/cidade/UF manualmente. Pedido: um serviço gratuito de consulta de CEP, RESTful, sem limite baixo de requisições, confiável e resiliente. Implementado seguindo o mesmo padrão já validado pela consulta de CNPJ (ORD-057/064): múltiplos provedores gratuitos encadeados com fallback automático — **BrasilAPI → ViaCEP → OpenCEP**.

> **Nota de processo:** história escrita retroativamente, depois da implementação, dos testes e do deploy. Não passou pelo fluxo upstream antes de ser codada — foi pedida e implementada dentro da mesma sessão de ajustes ao cadastro de cliente.

## Persona
**Super admin** cadastrando ou editando uma empresa — digita o CEP e espera que logradouro, bairro, cidade e UF sejam preenchidos automaticamente, com um aviso claro (não um erro confuso) se o CEP não for encontrado.

## Contexto

### Por que 3 provedores, e por que a lógica de fallback não é "primeiro 404 decide"
Primeira versão tratava um 404 de qualquer provedor como resposta definitiva ("não encontrado"), espelhando a lógica de CNPJ numérico. Um teste do próprio time (`test_lookup_cep_brasilapi_404_fallback_viacep`) expôs que isso contradizia o pedido de resiliência: bases de CEP de provedores diferentes divergem entre si (staleness, CEPs novos/rurais) — um único provedor dizer "não existe" não deveria ser definitivo. Corrigido: **só fecha como "não encontrado" depois que os três provedores concordarem** (nenhum achou); se todos falharem por rede/timeout, degrada para "indisponível" (sem bloquear o cadastro, endereço fica pra preenchimento manual) — essa distinção (`cep_not_found` vs `lookup_unavailable`) é sinalizada de volta pro chamador.

### Validação contra APIs reais (não só mocks)
Os três formatos de resposta (`_parse_brasilapi`, `_parse_viacep`, `_parse_opencep`) foram conferidos contra chamadas reais às três APIs (CEP válido e CEP inexistente `00000000`), não só contra os mocks dos testes — inclusive um detalhe não óbvio: ViaCEP responde `{"erro": "true"}` (string, não boolean) para CEP inexistente; o código usa `bool(data.get("erro"))`, que trata os dois casos corretamente.

## Explorer

### Fluxo principal
1. Usuário digita CEP válido → debounce 500ms → `GET /companies/cep-lookup/{cep}` → BrasilAPI (ou fallback) retorna endereço → logradouro/bairro/cidade/UF preenchidos automaticamente
2. CEP não encontrado nos três provedores → aviso inline "CEP não encontrado — preencha o endereço manualmente", sem bloquear o resto do cadastro
3. Todos os provedores indisponíveis (rede) → mesmo aviso de fallback manual, sem erro visível pro usuário

### Critérios de aceite
- [x] CEP válido preenche logradouro/bairro/cidade/UF automaticamente
- [x] CEP inexistente (confirmado pelos 3 provedores) retorna 404 com mensagem clara
- [x] CEP malformado retorna 422 sem chamar nenhuma API externa
- [x] Falha de rede em 1 ou 2 provedores não impede a consulta (fallback automático)
- [x] Rate limit (429) de um provedor nunca é interpretado como "não encontrado"
- [x] Campo funciona igual no cadastro (`NewCompanyScreen`) e na edição (`CompanyContractScreen`)

## QA Explorer

```gherkin
Feature: Consulta de CEP resiliente

  Scenario: CEP válido preenche endereço automaticamente
    Quando consulto o CEP "01310-100"
    Então recebo logradouro "Avenida Paulista", bairro "Bela Vista", cidade "São Paulo", UF "SP"

  Scenario: Um provedor fora do ar não impede a consulta
    Dado que a BrasilAPI está indisponível (timeout)
    Quando consulto um CEP válido
    Então o ViaCEP responde no lugar e o endereço é retornado normalmente

  Scenario: CEP não encontrado só é definitivo com os três provedores concordando
    Dado que BrasilAPI e OpenCEP retornam 404 e ViaCEP retorna {"erro": true}
    Quando consulto esse CEP
    Então recebo found=false, reason="cep_not_found"

  Scenario: Falha total de rede degrada sem bloquear
    Dado que os três provedores estão inacessíveis
    Quando consulto um CEP
    Então recebo found=false, reason="lookup_unavailable", HTTP 200 (não erro)

  Scenario: Formato inválido não gera chamada externa
    Quando consulto o CEP "123"
    Então recebo 422 e nenhum provedor é chamado
```

Validado via testes automatizados (respx mockando as 3 APIs, 12 cenários) e via chamada real às três APIs em produção local (CEP válido, CEP inexistente `00000000`) — suíte completa do company-service: 180/180.

## Tech Explorer

### Serviços impactados
- **`services/company/infrastructure/cep_lookup.py`** — novo módulo, mesmo padrão de `cnpj_lookup.py`
- **`services/company/main.py`** — `CepLookupOut` schema + `GET /companies/cep-lookup/{cep}` (superadmin, mesma proteção do cnpj-lookup)
- **`services/company/tests/test_consulta_cep.py`** — 12 testes novos
- **`frontend/admin/src/types.ts`** — `CepLookupResult`
- **`frontend/admin/src/api/companies.ts`** — `lookupCep()`
- **`frontend/admin/src/screens/NewCompanyScreen.tsx`** — busca debounced (500ms) no campo CEP, cadastro
- **`frontend/admin/src/screens/CompanyContractScreen.tsx`** — mesma busca, edição

### Design da resiliência
```python
async def lookup_cep(cep: str) -> CepLookupResult:
    providers = (brasilapi, viacep, opencep)  # nessa ordem
    algum_provedor_negou = False
    for url, parse, body_is_error in providers:
        result, negado = await _fetch(url, cep, parse, body_is_error)
        if result is not None:
            return result  # sucesso — encerra aqui
        algum_provedor_negou = algum_provedor_negou or negado
    # só aqui, depois dos 3, decide entre "não encontrado" e "indisponível"
    if algum_provedor_negou:
        return CepLookupResult(found=False, reason="cep_not_found")
    return CepLookupResult(found=False, reason="lookup_unavailable")
```
429 nunca conta como negação (`negado=False`) — rate limit não é sinal de inexistência, só tenta o próximo.

### Testes
- 12 testes de `infrastructure/cep_lookup.py` (sucesso por provedor, fallback em cada combinação, 429, todos indisponíveis, todos negando)
- 5 testes do endpoint `GET /companies/cep-lookup/{cep}` (sucesso, 404, 200 degradado, 422 sem chamar API, 403 pra não-superadmin)
- Suíte completa do company-service: 180/180
- Frontend: 47/47 unitários, `tsc --noEmit` limpo

### Riscos
- Depende de disponibilidade de serviços externos gratuitos, sem SLA contratual — mitigado pela própria resiliência de 3 provedores + degradação graciosa (nunca bloqueia o cadastro).
- Nenhum dos três provedores foi testado sob carga real de produção — comportamento sob volume alto (ex: rate limit agressivo) não validado além do que os testes de `respx` cobrem.

### Estimativa
5 pontos — módulo novo espelhando padrão existente, mas com iteração de design (fallback em 404) descoberta durante a escrita dos próprios testes.

---

## Ready

**Explorer:** [x] padrão de resiliência alinhado com CNPJ, formatos reais validados · **QA Explorer:** [x] 17 cenários automatizados + validação manual contra APIs reais · **Tech Explorer:** [x] módulo, endpoint, testes, riscos de dependência externa documentados · **Aprovação final:** aprovado no chat pelo usuário.

**Status: Done** — aplicado, testado e em produção local. História escrita retroativamente.
