---
id: ORD-109
status: Done
fase: 6
sprint: null
responsavel: Frontend
estimativa: 2 pontos
tipo: bugfix
---

# ORD-109 — Fix: tela de PIN do totem travada em 4 dígitos (backend gera 6)

## Descrição
Bug pré-existente, achado ao vivo durante a verificação da ORD-108 (2026-08-21): o PIN documentado da seed ("1234") não funcionava, nem um PIN recém-regenerado pelo admin. A tela de PIN do totem (`SetupScreen.tsx`) sempre aceitou só 4 dígitos (auto-submit em `pin.length === 4`), mas **todo PIN gerado pelo backend desde sempre tem 6 dígitos**:

```python
# services/company/main.py — create_company E regenerate_pin
new_pin = str(secrets.randbelow(900000) + 100000)  # 100000–999999
```

Confirmado também pelos próprios testes do backend, que já afirmavam `len(pin) == 6` (`test_company.py`, `test_coverage.py` — nunca ajustados pra bater com a tela do totem). Os únicos PINs de 4 dígitos que já funcionaram foram os 3 hashes gravados direto no seed inicial (`bbb002`, anterior à existência de `regenerate-pin`) — qualquer empresa nova ou qualquer PIN regenerado depois disso ficava, na prática, impossível de usar no totem.

## Causa raiz
`frontend/totem/src/screens/SetupScreen.tsx` — 3 pontos hardcoded em `4`:
- `pin.length >= 4` (trava de digitação)
- `next.length === 4` (dispara a validação)
- `[0,1,2,3].map(...)` (4 bolinhas de indicador)

## Fix
Os 3 pontos viraram `6`, alinhando com o tamanho real gerado pelo backend (opção escolhida em vez de encurtar a geração de PIN — mudar o backend reduziria a entropia do PIN já em uso por qualquer empresa real, e os testes de backend já validam 6 como o padrão esperado).

**Fora de escopo, não tocado:** `frontend/totem/src/screens/PinScreen.tsx` tem o mesmo bug, mas é código morto — não é importado por nenhum outro arquivo do totem (`App.tsx` usa só `SetupScreen.tsx`). Deixado como está.

## Dado de seed (dev) também ajustado
Os 3 PINs de 4 dígitos da seed inicial (Burger House=1234, Pasta & Co=5678, Sweet Corner=9999) ficariam inutilizáveis numa instalação nova depois do fix da UI. Nova migration substitui os `pin_hash` por PINs de 6 dígitos:
- Burger House: `184623`
- Pasta & Co: `507219`
- Sweet Corner: `936845`

`CLAUDE.md` e a memória de referência de dev foram atualizados com os novos valores.

## Downstream

- **Branch:** `fix/ord-109-pin-totem-6-digitos`, a partir de `main`.
- **`frontend/totem/src/screens/SetupScreen.tsx`:** os 3 pontos hardcoded em `4` → `6`, com comentário explicando a causa raiz.
- **`frontend/admin/src/screens/SettingsScreen.tsx`:** texto do card "PIN do totem" corrigido ("PIN de 4 dígitos" → "PIN de 6 dígitos").
- **`services/company/migrations/versions/20260821_1600_pin_seed_6_digitos.py`** (novo): substitui os `pin_hash` das 3 empresas seed por PINs de 6 dígitos.
- **`CLAUDE.md`:** linha de empresas demo atualizada com os novos PINs.
- `tsc --noEmit`: limpo (totem e admin).
- **Suíte completa do company-service:** 296 passed, mesmas 8 falhas pré-existentes já confirmadas em `main` (dívida de teste não relacionada, ver [[project_ordin_lint_debt]]-style).
- **Verificado ao vivo no Chrome:** limpei o `localStorage` do totem, entrei com PIN via "Entrar com PIN", digitei `184623` (6 dígitos, confirmados um a um por leitura de acessibilidade pra descartar erro de clique) → avançou corretamente pra tela de seleção de terminal da Burger House. Antes do fix, a tela tinha 4 bolinhas e nenhum PIN funcionava (nem o antigo de 4 dígitos, nem um recém-regenerado de 6).
- **Imprevisto durante a verificação:** os containers `company-service`/`order-service` entraram em crash loop (`alembic upgrade head` falhando com "Can't locate revision") porque o banco de dev já tinha a migration da ORD-108 aplicada (testada antes desta história), mas o arquivo dela só existia stashado (ORD-108 ainda não commitada). Resolvido restaurando os 2 arquivos de migration da ORD-108 do stash (sem trazer o resto das mudanças) e encadeando o `down_revision` desta migration nova a partir dela — não é um problema de código, só do fluxo de duas branches em paralelo compartilhando o mesmo banco de dev.
- PR ainda não aberta — implementação completa, aguardando decisão do usuário sobre commit/PR/merge.
