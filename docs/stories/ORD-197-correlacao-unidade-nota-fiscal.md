---
id: ORD-197
status: New
---

# Correlação entre unidade livre da NF-e e as unidades de estoque do Ordin

## Descrição

A NF-e não tem um enum fechado do SEFAZ pra `uCom`/`uTrib` — é texto livre, cada fornecedor escreve
do jeito que quiser ("UN", "CX", "PCT", "KG", "LT", "GR", etc.; confirmado lendo `_parse_nfe`,
`services/catalog/main.py`). O Ordin, por outro lado, tem um conjunto fechado e pequeno de unidades
de estoque (`STOCK_UNITS = ("un", "kg", "g", "L", "ml")`).

Hoje, no painel de resolução manual de item pendente (`ResolvePendingItemPanel.tsx`, C2/`ORD-196`),
a única tentativa de aproveitar a unidade da nota é uma normalização por igualdade exata
(case-insensitive) contra essas 5 opções — "UN" vira "un", "KG" vira "kg", mas qualquer variação
comum ("LT" pra litro, "GR" pra grama, "UND"/"PC" pra unidade) não casa com nada e cai direto no
fallback manual (usuário escolhe no Dropdown). Isso já é seguro hoje (nunca aplica errado, só não
pré-preenche) — a história é sobre reduzir quanto o usuário precisa escolher manualmente pra
sinônimos comuns, não sobre corrigir um bug.

## Persona

Admin da empresa — é quem resolve itens pendentes manualmente em C2 e vê o campo de unidade não
pré-preenchido mesmo quando a nota já trouxe uma unidade reconhecível (só com grafia diferente).

## Contexto

Achado pelo usuário testando ao vivo o C2 (`ORD-196`), registrado como pendência explícita na seção
"Implementação — achados adicionais" de `docs/stories/ORD-196-fila-pendencia-resolucao-manual.md`,
sem decisão de escopo ainda. Pontos que o Explorer desta história precisa resolver:

- Quais sinônimos valem a pena cobrir (lista inicial, não precisa ser exaustiva).
- Onde essa tabela deveria viver — só no frontend (like `STOCK_UNIT_OPTIONS` hoje), ou também no
  backend, considerando que outros fluxos também lidam com unidade de nota (ex: C1, casamento
  automático, que hoje grava `unidade=d.prod.uCom` sem nenhuma normalização).
- Se vale ampliar pra também reconhecer unidades de EMBALAGEM (FD, CX, PCT) como sinal — não como
  unidade de estoque em si (isso já é resolvido via "quantidade por unidade" em C2), mas talvez pra
  informar melhor a UI (ex: sugerir automaticamente que o item parece ser uma embalagem, sem exigir
  que o usuário perceba isso sozinho pelo campo EAN).
