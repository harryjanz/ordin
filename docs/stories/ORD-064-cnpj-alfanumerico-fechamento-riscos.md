---
id: ORD-064
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 5 pontos
---

# ORD-064 — CNPJ alfanumérico: fechar risco de vetores oficiais e corrigir gaps

## Descrição
O ORD-056 já implementou suporte a CNPJ alfanumérico (12 caracteres alfanuméricos + 2 dígitos verificadores) de forma proativa, antes mesmo do formato entrar em vigor, mas deixou um risco explicitamente registrado e nunca fechado: *"a implementação deve ser conferida contra vetores de teste oficiais publicados pela Receita Federal antes do deploy — não confiar cegamente na descrição acima sem esse confronto"* (ORD-056, Tech Explorer). O usuário forneceu material oficial da Receita/SERPRO (`docs/exemples/cnpj-alfa/` — **local, fora do controle de versão**, ver `.gitignore:16`) contendo a especificação do cálculo, exemplos de referência e implementações em Python/TypeScript/Java. Esta história confronta nossa implementação contra esse material, fecha o risco pendente, corrige os gaps reais encontrados e resolve uma preocupação levantada em revisão: **ninguém testou manualmente com um CNPJ alfanumérico de verdade, e os placeholders/máscaras dos campos nunca foram verificados visualmente com esse formato.**

## Persona
**Super admin** cadastrando/filtrando clientes por CNPJ (ORD-060/061/062), e indiretamente qualquer empresa cujo CNPJ novo formato passe pela validação.

## Contexto

### O que foi verificado e está correto
Rodei os 8 vetores de cálculo de DV publicados no material oficial (PDF SERPRO + `README.md` do exemplo Java) contra `domain/cnpj.py` (backend) — todos batem:

| Base (12 chars) | DV esperado (oficial) | DV calculado |
|---|---|---|
| `12ABC34501DE` | 35 | 35 ✅ |
| `1345C3A50001` | 06 | 06 ✅ |
| `R55231B30007` | 57 | 57 ✅ |
| `900213820001` | 22 | 22 ✅ |
| `900247780001` | 23 | 23 ✅ |
| `900251080001` | 21 | 21 ✅ |
| `900252550001` | 00 | 00 ✅ |
| `900244200001` | 09 | 09 ✅ |

E 9 dos 10 vetores de validação completa (CNPJ + DV) do exemplo Java também batem contra `is_valid_cnpj()` — incluindo casos negativos (DV errado, letra na posição do DV, tamanho incompleto). **O algoritmo (peso 5,4,3,2,9,8,7,6,5,4,3,2 / mod 11, `ord(char)-48`) está correto e agora tem confronto oficial** — o risco do ORD-056 pode ser fechado.

`lib/validators.ts` (frontend) espelha o mesmo algoritmo — mesma conclusão, mesmos vetores aplicáveis.

### Gap 1 — CNPJ zerado é aceito como válido
O único vetor que não bateu: `00000000000000`. As três implementações de referência (Java `CNPJValidator`, TypeScript `CNPJ.isValid`) rejeitam explicitamente um CNPJ totalmente zerado (`REGEX_VALOR_ZERADO = "^[0]+$"` / `cnpjZerado` check) **antes** de aplicar o cálculo do DV — porque matematicamente 14 zeros produz DV "00", que bate com os próprios 2 últimos zeros da string, passando no checksum por coincidência estrutural, não por ser um CNPJ real.

Testado contra o `domain/cnpj.py` atual, rodando dentro do container do `company-service`:
```
'00000000000000' -> True  MISMATCH (esperado False)
```
Confirmado: **nosso validador aceita `00000000000000` como CNPJ válido hoje**, tanto no backend quanto no frontend (mesmo algoritmo espelhado).

### Gap 2 — Consulta à Receita pode bloquear CNPJ alfanumérico legítimo
`infrastructure/cnpj_lookup.py` (ORD-057) já documenta o risco no próprio docstring: *"como o CNPJ alfanumérico é muito recente, não há garantia de que BrasilAPI/ReceitaWS já suportem esse formato"* — mas a degradação graciosa **só cobre timeout/erro/formato de resposta inesperado**, não cobre o caso mais provável na prática: a API responder **404 "não encontrado"** simplesmente porque não reconhece o formato alfanumérico na URL, não porque o CNPJ realmente não existe.

**Novo provedor sugerido pelo usuário: [cnpj.ws](https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj)** — API pública, `GET https://publica.cnpj.ws/cnpj/{cnpj_sem_mascara}`, sem autenticação. Consultei a documentação: **também não menciona suporte a CNPJ alfanumérico** (mesma situação de incerteza que BrasilAPI/ReceitaWS — trata-se de mais uma fonte candidata, não uma garantia). Duas características próprias que o Tech Explorer precisa considerar:
- **Rate limit: até 3 consultas por minuto *por CNPJ*** (não é limite global da conta) — resposta `429` quando excedido.
- Resposta 200 traz razão social, nome fantasia, situação cadastral, endereço completo e sócios — mesmo formato de dado que já extraímos de BrasilAPI/ReceitaWS, só nomes de campo diferentes.

Fica como **terceiro fallback** na cadeia (depois de BrasilAPI e ReceitaWS), com o mesmo tratamento cauteloso de 404 pra alfanumérico do Gap 2, mais tratamento de 429 (também inconclusivo — nunca bloqueante, mesmo pra CNPJ numérico, já que rate limit não é sinal de "não existe").

Hoje, um 404 de qualquer um dos dois provedores é tratado como resposta **definitiva** (`reason="cnpj_not_found"`), e isso **bloqueia o cadastro**:
- Frontend (`NewCompanyScreen.tsx:162-163`): `errs.document = "CNPJ não encontrado na Receita Federal"` — impede avançar do passo 1.
- Backend (`main.py`, endpoint `cnpj_lookup`): `raise HTTPException(404, "CNPJ não encontrado na Receita Federal")`.
- Backend (`main.py`, `create_company`): `raise HTTPException(422, "CNPJ não encontrado na Receita Federal")` — bloqueia mesmo se o front for contornado.

### Gap 3 — provedores ainda defasados: como tratar CNPJ alfanumérico não confirmado
Confirmado pelo usuário: o receio é real, nenhum dos três provedores (BrasilAPI, ReceitaWS, e agora `cnpj.ws`) confirma suporte a CNPJ alfanumérico na própria documentação — o Gap 2 já cobre o "não bloquear" quando nenhum confirma. A pergunta seguinte é: o que mostrar pro super admin quando a consulta não confirma nada, mesmo depois de tentar os três?

**Decisão tomada com o usuário:** continuar tentando a consulta normalmente (preserva o auto-preenchimento de endereço/razão social quando a API souber responder — não faz sentido abrir mão disso, já que vai passar a funcionar conforme os provedores atualizarem). Só quando a consulta **falhar/não reconhecer** (`reason="lookup_unavailable"`) **e o CNPJ for alfanumérico**, o sistema passa a marcar `cadastral_status="ATIVA"` automaticamente — em vez de deixar `"NAO_VERIFICADA"` — confiando no dígito verificador, que já foi validado localmente contra os vetores oficiais (Gap 1/confronto acima). Alternativa descartada: pular a consulta inteiramente pra CNPJ alfanumérico — perderia o auto-preenchimento à toa, sem ganhar nada em troca (a consulta continua barata de tentar, só não é mais bloqueante).

**Isso não é "fingir que verificamos"** — a UI precisa deixar claro que essa confirmação é local (DV), não uma confirmação real da Receita, pra não criar falsa confiança (ver Tech Explorer, texto do card verde precisa ser distinto do caso de confirmação real via API).

### Gap 4 — Placeholders/máscaras nunca testados com CNPJ alfanumérico
Revisão apontou (com razão) que essa parte da história nunca foi verificada visualmente nem coberta por teste específico. Os campos de CNPJ (`NewCompanyScreen`, `CompanyListScreen`) usam `placeholder="00.000.000/0000-00"` — um exemplo **totalmente numérico**, que sugere ao usuário (mesmo sem bloquear o teclado) que só dígitos são esperados. Precisa virar um placeholder que não sugira isso (`XX.XXX.XXX/XXXX-XX`, convenção padrão de "qualquer caractere aqui").

A máscara em si (`formatCnpj`, `lib/masks.ts`) só insere pontuação por posição (índice), nunca inspeciona o conteúdo do caractere — matematicamente já deveria funcionar igual pra letra ou dígito. Mas isso **nunca foi visto funcionando na tela**, só inferido lendo o código. Esta história inclui verificação ao vivo no navegador (mesmo método usado nos bugs do ORD-062: screenshot real, não suposição) digitando um CNPJ alfanumérico de verdade nos três campos (`input-cnpj` do wizard, `input-filtro-cnpj` da listagem, e a exibição em `CompanyContractScreen`).

### O que já está OK, sem necessidade de ajuste
- Nenhum campo de CNPJ no frontend tem `inputMode`/`type`/`pattern` numérico — todos são `<input>` de texto livre, letras já passam sem bloqueio de teclado (confirmado por leitura de código; Gap 4 confirma visualmente).
- Coluna `document` no banco é `String(20)`, sem `CHECK` constraint — sem ajuste de schema/migration necessário.
- Nenhum outro serviço (`order`, `payment`, `catalog`, `auth`) ou frontend (`totem`, `balcao`) referencia CNPJ — o escopo é 100% `company-service` + `frontend/admin`.
- **CPF não é afetado** — o novo formato alfanumérico é exclusivo do CNPJ (pessoa jurídica); CPF (pessoa física, usado no responsável legal) continua 100% numérico pela Receita. Nenhuma mudança em `domain/cpf.py`/`lib/validators.ts` (`isValidCpf`) — registrado aqui explicitamente pra quem for implementar não generalizar por engano.

### Dependências
Nenhuma história bloqueante — ajusta código já em `main` (ORD-056/057/060/061).

---

## Explorer

## História
Como **time de engenharia**, quero confrontar a validação de CNPJ alfanumérico contra os vetores de teste oficiais da Receita/SERPRO, corrigir os gaps encontrados, definir o que fazer quando a consulta externa não confirma um CNPJ alfanumérico, e verificar visualmente (não só por leitura de código) que máscara e placeholders funcionam nesse formato — para fechar o risco registrado no ORD-056 e evitar que CNPJs alfanuméricos legítimos sejam indevidamente rejeitados ou mal exibidos no cadastro.

### Fluxo principal
1. `is_valid_cnpj`/`isValidCnpj` passam a rejeitar CNPJ totalmente zerado, mesmo que o checksum "bata"
2. `lookup_cnpj` (backend), ao receber 404 de um provedor para um CNPJ alfanumérico (contém letra), não trata como resposta definitiva — tenta o próximo provedor
3. Se nenhum provedor confirmar (`lookup_unavailable`) e o CNPJ for alfanumérico → `cadastral_status` é marcado `"ATIVA"` automaticamente (confiando no DV local), com texto distinto de uma confirmação real via API
4. CNPJ numérico legado continua exatamente como hoje em ambos os pontos (404 bloqueia, `lookup_unavailable` fica `"NAO_VERIFICADA"`) — nada muda pra ele
5. Placeholders dos campos de CNPJ deixam de sugerir formato só-numérico
6. Verificação manual ao vivo no navegador: cadastro completo via wizard usando um CNPJ alfanumérico real, screenshot de cada etapa

### Fluxos alternativos / exceções
- CNPJ alfanumérico onde AMBOS os provedores retornam 404/erro → `cadastral_status="ATIVA"` (Gap 3), preenchimento manual dos campos que a consulta não conseguiu trazer
- CNPJ alfanumérico onde um provedor confirma normalmente → usa o resultado real da API (comportamento de fallback já existente, não muda) — auto-preenchimento continua funcionando quando o provedor já suportar
- CNPJ numérico com 404 → continua bloqueando (`cnpj_not_found`), sem mudança
- CNPJ numérico com `lookup_unavailable` (timeout, etc.) → continua `"NAO_VERIFICADA"`, sem mudança (Gap 3 é exclusivo de alfanumérico)

### Critérios de aceite funcionais
- [ ] `00000000000000` é rejeitado por `is_valid_cnpj` (backend) e `isValidCnpj` (frontend)
- [ ] Os 8 vetores oficiais de cálculo de DV e os 9 vetores de validação viram testes automatizados permanentes, backend e frontend
- [ ] Massa adicional de CNPJ alfanumérico (letras em posições variadas — início, meio, fim, intercaladas, base 100% letras) gerada e validada localmente, usada nos testes de integração e no cadastro E2E
- [ ] 404 de provedor de consulta para CNPJ alfanumérico não bloqueia mais o cadastro — degrada para inconclusivo
- [ ] CNPJ alfanumérico com consulta inconclusiva vira `cadastral_status="ATIVA"` automaticamente, com mensagem que deixa claro que é uma confirmação local (DV), não da Receita
- [ ] CNPJ numérico legado: nenhuma mudança de comportamento em nenhum dos dois pontos acima (404 continua bloqueando; `lookup_unavailable` continua `"NAO_VERIFICADA"`)
- [ ] Placeholder dos campos de CNPJ (`NewCompanyScreen`, `CompanyListScreen`) não sugere formato só-numérico
- [ ] Verificação manual ao vivo (screenshot): CNPJ alfanumérico digitado corretamente com máscara nos 3 pontos onde aparece (wizard, filtro da listagem, tela de detalhe), cadastro completo até o fim
- [ ] Risco do ORD-056 ("confronto com vetores oficiais pendente") marcado como resolvido, com referência a esta história

---

## QA Explorer

```gherkin
Feature: Correção de gaps de validação de CNPJ alfanumérico

  Scenario Outline: Vetores oficiais de cálculo de DV
    Quando calculo o DV da base "<base>"
    Então o resultado é "<dv_esperado>"

    Examples:
      | base           | dv_esperado |
      | 12ABC34501DE   | 35          |
      | 1345C3A50001   | 06          |
      | R55231B30007   | 57          |
      | 900213820001   | 22          |
      | 900247780001   | 23          |
      | 900251080001   | 21          |
      | 900252550001   | 00          |
      | 900244200001   | 09          |

  Scenario Outline: Vetores oficiais de validação completa
    Quando valido o CNPJ "<cnpj>"
    Então o resultado é <valido>

    Examples:
      | cnpj                  | valido |
      | 12ABC34501DE35        | true   |
      | 1345C3A5000106        | true   |
      | R55231B3000700        | false  |
      | 90.021.382/0001-22    | true   |
      | 90.024.778/000123     | true   |
      | 90.025.108/000101     | false  |
      | 90.025.255/0001       | false  |
      | 90.024.420/0001A2     | false  |
      | R55231B3000757        | true   |

  Scenario: CNPJ totalmente zerado é rejeitado
    Quando valido o CNPJ "00000000000000"
    Então o resultado é inválido, mesmo o checksum matematicamente "batendo"

  Scenario Outline: Massa adicional — letras em posições variadas
    Dado um CNPJ alfanumérico gerado com letras em posição "<posicao>"
    Quando valido esse CNPJ
    Então o resultado é válido

    Examples:
      | posicao                          | cnpj              |
      | base 100% letras                 | ABCDEFGHIJKL80    |
      | alternando letra/dígito          | A1B2C3D4E5F668     |
      | dígitos seguidos de letras       | 1234567ABCDE88     |
      | pares letra/dígito               | AB12CD34EF5602     |
      | letras esparsas                  | 00A000B000C084     |
      | blocos de letras e dígitos       | ZZ999YY888XX24     |

  Scenario: 404 em CNPJ alfanumérico não bloqueia o cadastro
    Dado um CNPJ alfanumérico válido (DV correto) que nenhum provedor de consulta reconhece
    Quando tento cadastrar
    Então o cadastro é criado com sucesso, sem erro "CNPJ não encontrado na Receita Federal"

  Scenario: CNPJ alfanumérico não confirmado vira ATIVA automaticamente
    Dado um CNPJ alfanumérico válido que nenhum provedor confirma
    Quando consulto ou cadastro esse CNPJ
    Então a situação cadastral mostrada é "ATIVA"
    E o texto explica que a confirmação é local (dígito verificador), não da Receita Federal

  Scenario: 404 em CNPJ numérico continua bloqueando
    Dado um CNPJ numérico legado que os provedores retornam 404
    Quando tento cadastrar
    Então recebo erro "CNPJ não encontrado na Receita Federal" — comportamento inalterado

  Scenario: CNPJ numérico com consulta indisponível continua "não verificada"
    Dado um CNPJ numérico legado cuja consulta dá timeout
    Quando cadastro esse CNPJ
    Então a situação cadastral fica "NAO_VERIFICADA" — sem a promoção automática do Gap 3, que é exclusiva de alfanumérico

  Scenario: Placeholder não sugere formato só-numérico
    Dado que abro a tela de cadastro ou a listagem de clientes
    Quando olho o campo de CNPJ vazio
    Então o placeholder não é composto só de zeros

  Scenario: Verificação manual — cadastro completo com CNPJ alfanumérico real
    Dado o ambiente local rodando via docker compose
    Quando digito um CNPJ alfanumérico da massa de teste no wizard
    Então a máscara pontua corretamente enquanto digito
    E o card de situação cadastral aparece corretamente (via API ou via ATIVA local)
    E o cadastro completa até o fim
    E a tela de detalhe exibe o CNPJ mascarado corretamente
    E cada etapa é validada com screenshot

  Scenario: CPF não é afetado
    Dado o cadastro do responsável legal com CPF
    Quando reviso o código alterado nesta história
    Então nenhuma linha de domain/cpf.py ou da validação de CPF no frontend foi tocada
```

**Aprovado pelo PM.** Cenário mais crítico: a promoção automática pra ATIVA (Gap 3) só pode se aplicar a CNPJ alfanumérico — se vazar pra CNPJ numérico, todo cadastro com consulta fora do ar passaria a se apresentar como "ativo" sem nunca ter sido confirmado, o que é pior que o comportamento atual.

---

## Tech Explorer

### Serviços impactados
- **`services/company/domain/cnpj.py`** — guarda contra CNPJ zerado + helper `is_alphanumeric_cnpj` compartilhado
- **`services/company/infrastructure/cnpj_lookup.py`** — 404 não confiável pra CNPJ alfanumérico + novo provedor `cnpj.ws` (terceiro fallback) + tratamento de 429 (rate limit)
- **`services/company/main.py`** — promoção automática pra `ATIVA` quando alfanumérico + inconclusivo (nos dois pontos: endpoint `cnpj_lookup` e `create_company`)
- **`frontend/admin/src/lib/validators.ts`** — mesma guarda contra CNPJ zerado (espelha o backend)
- **`frontend/admin/src/screens/NewCompanyScreen.tsx`** — texto distinto pro card de "ATIVA confirmada localmente" vs. "ATIVA confirmada pela Receita"; placeholder
- **`frontend/admin/src/screens/CompanyListScreen.tsx`** — placeholder
- **Testes**: `services/company/tests/`, `frontend/admin/src/lib/__tests__/`, novo spec E2E ou extensão do `cadastro-cliente.spec.ts`

### `domain/cnpj.py` — guarda de CNPJ zerado + helper compartilhado
```python
_CNPJ_ZERADO = "0" * 14

def is_valid_cnpj(raw: str) -> bool:
    cnpj = normalize_cnpj(raw)
    if len(cnpj) != 14 or cnpj == _CNPJ_ZERADO:
        return False
    ...

def is_alphanumeric_cnpj(raw: str) -> bool:
    """True se o CNPJ (normalizado) contém ao menos uma letra — usado pra
    decidir se um 404/indisponibilidade de consulta deve ser tratado com
    mais cautela (provedores externos podem não suportar o formato novo)."""
    return any(c.isalpha() for c in normalize_cnpj(raw))
```

### `lib/validators.ts` — mesma guarda
```ts
const CNPJ_ZERADO = "0".repeat(14);

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== 14 || cnpj === CNPJ_ZERADO) return false;
  ...
}
```

### `infrastructure/cnpj_lookup.py` — 404 não confiável pra alfanumérico + novo provedor `cnpj.ws`
```python
_CNPJWS_URL = "https://publica.cnpj.ws/cnpj/{cnpj}"

from domain.cnpj import is_alphanumeric_cnpj

def _parse_cnpjws(data: dict) -> CnpjLookupResult:
    situacao = ((data.get("estabelecimento") or {}).get("situacao_cadastral") or "").strip().upper()
    estab = data.get("estabelecimento") or {}
    return CnpjLookupResult(
        found=True,
        cadastral_status=situacao or "NAO_VERIFICADA",
        legal_name=data.get("razao_social"),
        trade_name=estab.get("nome_fantasia"),
        zip_code=estab.get("cep"),
        street=estab.get("logradouro"),
        address_number=estab.get("numero"),
        complement=estab.get("complemento"),
        neighborhood=estab.get("bairro"),
        city=(estab.get("cidade") or {}).get("nome"),
        state=estab.get("uf"),
    )
    # nomes de campo exatos a confirmar contra uma resposta real na implementação —
    # estrutura acima é a leitura da documentação, não uma resposta testada

async def _try_provider(url_template: str, cnpj: str, parse) -> CnpjLookupResult | None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url_template.format(cnpj=cnpj))
        if resp.status_code == 429:
            return None  # rate limit — nunca é sinal de "não existe", sempre inconclusivo
        if resp.status_code == 404:
            if is_alphanumeric_cnpj(cnpj):
                return None  # inconclusivo, deixa o fallback decidir
            return CnpjLookupResult(found=False, reason="cnpj_not_found")
        if resp.status_code != 200:
            return None
        return parse(resp.json())
    except Exception as exc:
        logger.warning("Falha na consulta de CNPJ — %s", exc)
        return None
```
`_try_brasilapi`/`_try_receitaws` continuam existindo (formato de resposta é específico de cada um, por isso o parse fica separado), mas passam a delegar a lógica de status HTTP pra uma função compartilhada (`_try_provider` acima é ilustrativo — na implementação real, adaptar sem duplicar a lógica de 404/429 três vezes). `lookup_cnpj` ganha uma terceira tentativa:
```python
async def lookup_cnpj(cnpj: str) -> CnpjLookupResult:
    for attempt in (_try_brasilapi, _try_receitaws, _try_cnpjws):
        result = await attempt(cnpj)
        if result is not None:
            return result
    return CnpjLookupResult(found=False, reason="lookup_unavailable", cadastral_status="NAO_VERIFICADA")
```
Rate limit de `cnpj.ws` é por CNPJ consultado (3/min), não por conta — na prática só afeta quem re-digita o mesmo CNPJ várias vezes em menos de um minuto (o debounce de 500ms do wizard já reduz bastante essa chance, mas não elimina).

### `main.py` — promoção automática pra ATIVA (Gap 3)
Aplicado nos **dois** pontos que chamam `lookup_cnpj` — endpoint `GET /companies/cnpj-lookup/{cnpj}` (consulta ao vivo do wizard) e `create_company` (revalidação no submit) — pra super admin ver o mesmo veredito antes e depois de enviar:

```python
result = await lookup_cnpj(normalized)
if not result.found and result.reason == "lookup_unavailable" and is_alphanumeric_cnpj(normalized):
    result = replace(result, cadastral_status="ATIVA")  # dataclasses.replace — CnpjLookupResult é @dataclass
```
`found` continua `False` (não fingimos que a Receita confirmou) — só `cadastral_status` muda, e é isso que o restante do código (frontend e `create_company`) já usa pra decidir se bloqueia ou não. **Aplicar só quando `is_alphanumeric_cnpj` for verdadeiro** — CNPJ numérico com `lookup_unavailable` continua exatamente como hoje.

### `NewCompanyScreen.tsx` — texto distinto pro card verde
Hoje o card verde (`lookupOk`) só aparece quando `lookupResult?.found && cadastral_status === "ATIVA"`. Precisa passar a aparecer também quando `cadastral_status === "ATIVA"` mesmo com `found === false` (o caso novo do Gap 3), mas com um texto que deixa claro a diferença:
```tsx
{!lookupLoading && lookupResult?.cadastral_status === "ATIVA" && (
  <div style={S.lookupOk} data-testid="lookup-ativa">
    {lookupResult.found ? (
      <strong>Situação cadastral: ATIVA</strong>
    ) : (
      <strong>Dígito verificador válido — CNPJ alfanumérico ainda não confirmável pela Receita</strong>
    )}
    ...
  </div>
)}
```
Texto exato fica a critério de quem implementar, mas **precisa** deixar explícito que não é uma confirmação da Receita quando `found` é `false` — é a exigência central do Gap 3 (não fingir confirmação que não existe).

### Placeholders
`NewCompanyScreen.tsx` e `CompanyListScreen.tsx`: trocar `placeholder="00.000.000/0000-00"` por `placeholder="XX.XXX.XXX/XXXX-XX"` nos dois campos de CNPJ digitável (o campo de `CompanyContractScreen` é `disabled`, mostra o valor real, não tem placeholder relevante).

### Massa de teste adicional (gerada localmente, validada contra o próprio algoritmo)
Diferente dos vetores oficiais (Seção "O que foi verificado"), estes são gerados e auto-validados — úteis pra cobertura de posição de letra, não como confronto externo:

| Base | DV | CNPJ completo | Cobre |
|---|---|---|---|
| `ABCDEFGHIJKL` | 80 | `ABCDEFGHIJKL80` | 100% letras na base |
| `A1B2C3D4E5F6` | 68 | `A1B2C3D4E5F668` | letra/dígito alternados |
| `1234567ABCDE` | 88 | `1234567ABCDE88` | dígitos seguidos de letras |
| `AB12CD34EF56` | 02 | `AB12CD34EF5602` | pares letra/dígito |
| `00A000B000C0` | 84 | `00A000B000C084` | letras esparsas |
| `ZZ999YY888XX` | 24 | `ZZ999YY888XX24` | blocos |

### Testes
- **Backend**: novo arquivo `tests/test_ord064_vetores_oficiais_cnpj.py` — parametrizado com os 8+9 vetores oficiais + os 6 da massa adicional + o CNPJ zerado. Extensão de `test_ord057_consulta_cnpj_receita.py` mockando `httpx` pra simular 404 dos **três** provedores com CNPJ alfanumérico → confirma `cadastral_status="ATIVA"`, `found=False`; mesmo mock com CNPJ numérico → confirma `cnpj_not_found` (comportamento antigo intacto); mock de 429 do `cnpj.ws` → confirma que não bloqueia nem pra CNPJ numérico (rate limit nunca é "não encontrado").
- **Frontend**: extensão de `lib/__tests__/validators.test.ts` com os mesmos vetores.
- **E2E**: novo teste em `cadastro-cliente.spec.ts` (ou spec próprio) — wizard completo com um CNPJ alfanumérico da massa de teste, mockando ou aceitando que a consulta real provavelmente vai falhar (ambiente real, sem mock de rede em E2E, consistente com o resto do projeto) — o teste em si serve de verificação viva de que o Gap 3 funciona ponta a ponta.
- **Verificação manual ao vivo**: screenshots reais no navegador (não só o E2E) digitando um CNPJ alfanumérico da massa nos 3 campos onde aparece — é o item que motivou esta atualização da história, não pode ficar só no "deveria funcionar pela leitura do código".

### Impacto em outros serviços
Nenhum.

### Riscos
- Vetores oficiais vêm de material de terceiro (SERPRO) copiado localmente, não versionado no repo — embutidos diretamente nos testes por isso.
- A promoção automática pra ATIVA (Gap 3) é uma decisão de produto, não uma confirmação real — se algum dia isso importar pra emissão fiscal/nota fiscal (fora do escopo atual do ordin), precisa ser revisitada; registrado aqui como débito consciente, não esquecido.
- Mudança em `cnpj_lookup.py`/`main.py` é comportamental — testar bem o caminho de CNPJ numérico em ambos os pontos pra garantir que não regride (critérios de aceite específicos pra isso).
- **Nomes de campo do `cnpj.ws` não foram confirmados contra uma resposta real** — a documentação consultada (via fetch, não uma chamada real à API) descreve os campos em prosa, mas o `_parse_cnpjws` proposto acima é uma leitura best-effort, não uma resposta testada. Quem implementar precisa fazer pelo menos uma chamada real (`curl https://publica.cnpj.ws/cnpj/{cnpj numérico conhecido}`) antes de confiar no parser — mesmo padrão de cautela que os outros dois provedores já tiveram quando implementados (ORD-057).
- Adicionar um terceiro provedor aumenta a latência do pior caso (timeout dos dois primeiros antes de tentar o terceiro) — aceitável dado que a consulta já é assíncrona/não-bloqueante na UI, mas vale considerar um timeout mais agressivo que os 10s atuais se isso incomodar na prática.

### Estimativa
5 pontos — o escopo cresceu depois da revisão inicial (promoção automática pra ATIVA + placeholders + massa de teste + verificação manual ao vivo + terceiro provedor de consulta), mas continua contido a poucos arquivos já conhecidos. O terceiro provedor (`cnpj.ws`) por si só não deveria mudar a estimativa — é o mesmo padrão de `_try_brasilapi`/`_try_receitaws` já existente, só replicado.

---

## Ready

**Explorer:** [x] contexto do risco pendente do ORD-056, os quatro gaps encontrados (zerado, 404 alfanumérico, promoção pra ATIVA, placeholders), decisão de produto do Gap 3 confirmada com o usuário, escopo confirmado (CPF fora, outros serviços não afetados) · **QA Explorer:** [x] vetores oficiais + massa adicional parametrizados, cenário de promoção pra ATIVA isolado de CNPJ numérico, verificação manual ao vivo como critério explícito · **Tech Explorer:** [x] diffs propostos pros 5 arquivos, estratégia de teste, riscos registrados (inclusive o débito consciente da promoção automática) · **Aprovação final:** pendente — apresentada ao usuário.

**Status: Ready** — sem bloqueadores técnicos, pode começar assim que priorizada.
