# ORD-044 — Totem: grid de produtos 3 colunas + imagens mais altas

**Status:** Done  
**Pontos:** 1  
**Sprint:** UX

---

## Explorer

Atualmente o catálogo exibe os produtos em **2 colunas** com imagens de **140px de altura**. Em totens com tela mais larga (≥ 1080px, padrão em quiosques), 2 colunas desperdiça espaço horizontal e as imagens ficam relativamente pequenas em relação ao card.

**Objetivo:** 3 colunas por linha + imagens mais altas, para melhorar a visibilidade e aproveitar melhor a tela do totem.

**Impacto no layout por coluna (estimativa em tela 1080px):**
- 2 colunas: card ~502px de largura
- 3 colunas: card ~327px de largura

Com cards mais estreitos, fontes de nome e preço precisam ser ligeiramente ajustadas para manter legibilidade.

---

## QA Explorer

### Cenário 1 — Grid 3 colunas
```gherkin
Dado que o totem exibe a tela de catálogo com produtos disponíveis
Então os produtos são exibidos em 3 colunas
E todos os cards têm a mesma largura
```

### Cenário 2 — Imagens mais altas
```gherkin
Dado que um produto tem image_url preenchida
Quando o card é renderizado
Então a imagem tem altura maior que 140px
```

### Cenário 3 — Placeholder mantém mesma altura
```gherkin
Dado que um produto não tem image_url
Quando o card é renderizado
Então o placeholder (ícone 🍽️) tem a mesma altura da imagem real
```

### Cenário 4 — Controles de quantidade funcionam
```gherkin
Dado que o grid mudou para 3 colunas
Quando toco "+" em qualquer produto
Então o stepper aparece corretamente dentro do card
E os botões − e + são tocáveis (≥ 44px)
```

---

## Tech Explorer

### Arquivo alterado
`frontend/totem/src/screens/CatalogScreen.tsx`

### Mudanças exatas

| Linha | Antes | Depois |
|---|---|---|
| 133 | `gridTemplateColumns: "repeat(2, 1fr)"` | `gridTemplateColumns: "repeat(3, 1fr)"` |
| 167 | `height: 140` (img) | `height: 180` |
| 180 | `height: 140` (placeholder) | `height: 180` |
| 184 | `fontSize: 20` (nome) | `fontSize: 17` |
| 192 | `fontSize: 22` (preço) | `fontSize: 19` |

Ajuste de fonte necessário porque com cards ~30% mais estreitos, nome e preço em 20/22px ficam muito grandes proporcionalmente.

---

## Critérios de aceite

- [ ] 3 colunas de produtos no grid
- [ ] Imagens e placeholders com altura 180px
- [ ] Nome do produto legível (sem quebra excessiva de linha)
- [ ] Preço legível
- [ ] Botões +/− mantêm toque ≥ 44px
- [ ] Sem overflow horizontal
