---
id: ORD-187
status: Ready
estimativa: 3 pontos (backend + frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-187 — Custo manual e margem de lucro (produto CFOP 5102)

## Descrição
História **A7** do épico de estoque/ERP (`docs/estudo-modulo-estoque-erp.md`, Bloco F —
Visibilidade e custo). Achado nos prints do Mercado Livre (2026-09-18): preço de venda + custo lado
a lado, com margem de lucro calculada ao vivo. Sem dependência de nenhuma outra história do épico —
não precisa de `stock_item`, `estoque_minimo` nem XML, só de `price` (já existente) e um campo novo
de custo.

## Persona
**Empresa** (owner/manager/admin que gerencia catálogo).

## Explorer

### História
Como **Empresa**, quero registrar o custo de compra de um produto de revenda (CFOP 5102) e ver a
margem de lucro calculada automaticamente, para saber quanto realmente ganho em cada venda, sem
fazer conta de cabeça.

### Decisão de escopo — só CFOP 5102, e por quê
Comida preparada (CFOP 5101) e revenda pura (CFOP 5102) têm estrutura de custo diferente — mesma
distinção que já orienta o épico inteiro (regra de CFOP da A4). Pra CFOP 5102 (ex.: uma lata de
refrigerante revendida do jeito que chegou), custo é um número direto — quanto a Empresa pagou pelo
item. Pra CFOP 5101 (produção própria, ex. X-Burger), custo é a soma dos insumos da ficha técnica —
**isso já é a E4 (CMV automático)**, história futura do Bloco E, que depende de E1+E2+B1. Esta
história **não** duplica esse trabalho — só cobre o caso simples (5102), que não depende de nada
além do cadastro do produto em si.

### Decisão de escopo — `custo` é campo manual, independente de XML
`Product.custo` é editável a qualquer momento pela Empresa, sem depender do Bloco B (importação de
XML). Quando B1 existir, pode futuramente sugerir atualizar `custo` a partir do valor da NF
importada — melhoria a considerar depois, não faz parte do escopo desta história.

### Posicionamento no formulário
Os campos "Custo" e "Margem de lucro" entram na seção **"Classificação fiscal"** do
`ProductEditScreen.tsx` (onde já vivem CFOP/NCM/CEST, ver `ORD-180`), não em "Informações básicas"
(onde vive "Preço") — motivo: a visibilidade dos campos depende do CFOP já selecionado, que só está
visível nessa seção. Aparecem **condicionalmente**, só quando `cfop === "5102"` — produto CFOP 5101
ou sem CFOP definido não vê esses campos (evita confundir a Empresa com um número que não reflete o
custo real de um prato preparado).

- **Custo**: `CurrencyInput`, mesmo componente já usado pro "Preço" (`Informações básicas`,
  `ProductEditScreen.tsx:506-510`), rótulo "Custo", opcional.
- **Margem de lucro**: campo somente leitura, calculado ao vivo (`price - custo`, e `%` sobre o
  preço) — sem custo preenchido, mostra estado vazio ("Informe o custo para ver a margem", mesmo
  texto do print do Mercado Livre), não um erro. **Arredondamento** (achado de PM): valor em R$
  sempre com 2 casas decimais (padrão BRL já usado no resto do sistema); `%` sem casas decimais.
  **Margem negativa** (achado de PM): `Tag variant="error"`, texto "Margem negativa — este produto
  está sendo vendido abaixo do custo".

### Fluxo principal
1. Empresa edita um produto com CFOP 5102.
2. Na seção "Classificação fiscal", preenche "Custo".
3. "Margem de lucro" atualiza ao vivo, sem precisar salvar antes: valor em R$ e % sobre o preço de
   venda.
4. Salva — `custo` é persistido, margem não é (sempre recalculada, nunca armazenada — evita
   inconsistência se `price` mudar depois e a margem salva ficar desatualizada).

### Fluxos alternativos / exceções
- **Custo maior que o preço de venda** (margem negativa): permitido, mostrado em vermelho/alerta
  visual — é informação real (a Empresa está vendendo no prejuízo), não um erro de validação.
- **Produto CFOP 5101 ou sem CFOP**: campos de custo/margem não aparecem — sem mudança de
  comportamento.
- **Trocar CFOP de 5102 pra 5101 com custo já preenchido**: `custo` continua salvo no banco (não é
  apagado), só some da tela enquanto o CFOP não for 5102 de novo — evita perda de dado se a Empresa
  trocar o CFOP por engano e voltar atrás.

### Dependências
- **Nenhuma bloqueante** — só precisa de `Product.price` (já existe) e `Product.cfop` (já existe,
  `ORD-169`).
- **Relacionada, não bloqueante**: E4 (CMV automático, Bloco E) cobre o equivalente pra CFOP 5101 —
  quando a E4 existir, vale só garantir que a UI de margem desta história e a da E4 tenham a mesma
  aparência visual, não fundir os dois mecanismos.

### Critérios de aceite funcionais
- [ ] `Product.custo` opcional, editável a qualquer momento, independente de XML
- [ ] Margem de lucro (R$ e %) calculada ao vivo, nunca persistida
- [ ] Campos só aparecem para produto CFOP 5102
- [ ] Custo maior que o preço é permitido, com alerta visual (`Tag variant="error"`, não erro de validação)
- [ ] Margem em R$ com 2 casas decimais, `%` sem casas decimais
- [ ] Trocar CFOP não apaga o `custo` já salvo, só esconde a exibição

## QA Explorer

### Achado: falta validar `custo >= 0`
Sem sentido econômico ter custo negativo — mesma regra já aplicada a `estoque_minimo` (`ORD-183`)
e `fator_conversao` (`ORD-184`).

### Cenários Gherkin

```gherkin
Feature: Custo manual e margem de lucro (CFOP 5102)
  Como Empresa
  Quero registrar o custo de um produto de revenda e ver a margem calculada
  Para saber quanto realmente ganho em cada venda

  Scenario: Margem calculada corretamente (happy path)
    Dado um produto CFOP 5102 com preço R$ 6,50
    Quando informo custo R$ 3,49
    Então a margem mostra R$ 3,01 (46%)

  Scenario: Margem negativa mostra alerta
    Dado um produto CFOP 5102 com preço R$ 5,00
    Quando informo custo R$ 7,00
    Então a margem mostra -R$ 2,00 (-40%) com Tag variant="error"

  Scenario: Margem exatamente zero (custo igual ao preço)
    Dado um produto CFOP 5102 com preço R$ 5,00
    Quando informo custo R$ 5,00
    Então a margem mostra R$ 0,00 (0%), sem alerta de erro (zero não é negativo)

  Scenario: Produto sem custo mostra estado vazio
    Dado um produto CFOP 5102 sem custo preenchido
    Quando abro a seção "Classificação fiscal"
    Então vejo "Informe o custo para ver a margem", não um erro

  Scenario: Produto CFOP 5101 não mostra os campos
    Dado um produto CFOP 5101
    Quando abro a seção "Classificação fiscal"
    Então os campos "Custo" e "Margem de lucro" não aparecem

  Scenario: Trocar CFOP preserva o custo salvo, só esconde da UI
    Dado um produto CFOP 5102 com custo R$ 3,49 já salvo
    Quando troco o CFOP para 5101 e salvo
    Então o campo "Custo" some da UI, mas o valor continua no banco
    E se eu trocar de volta pra CFOP 5102, o custo R$ 3,49 reaparece

  Scenario: Custo negativo é rejeitado
    Dado um produto CFOP 5102
    Quando tento informar custo -R$ 1,00
    Então o sistema rejeita — custo não pode ser negativo

  Scenario: Arredondamento de percentual
    Dado um produto CFOP 5102 com preço R$ 10,00 e custo R$ 3,33
    Quando calculo a margem
    Então a margem em % é arredondada sem casas decimais, usando ROUND_HALF_UP (mesma convenção
    já estabelecida na ORD-184)
```

### Critérios de aceite testáveis
- [ ] `custo >= 0` validado (achado desta revisão)
- [ ] Margem zero (custo == preço) não dispara o alerta de erro
- [ ] Custo preservado no banco ao trocar CFOP, mesmo escondido na UI
- [ ] Arredondamento de % usa `ROUND_HALF_UP`, mesma convenção já estabelecida na `ORD-184`

### Confirmação da revisão de QA (não é lacuna)
**Isolamento multi-tenant**: `custo` é só mais um campo do endpoint de `Product` já isolado — sem
necessidade de teste novo.

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante — revisão de QA aprovada com os cenários acima incorporados.

## Tech Explorer

### Migration e model (`Product`, linha 129)

```python
custo = Column(Numeric(10, 2), nullable=True)  # mesma precisão de price (linha 138)
```

Migration nova, `services/catalog/migrations/versions/YYYYMMDD_HHMM_custo_produto.py` — `ADD
COLUMN` nullable, sem backfill.

### Schema (`ProductIn`/`ProductUpdate`)

```python
custo: float | None = None

@field_validator("custo")
@classmethod
def _custo_non_negative(cls, v: float | None) -> float | None:
    if v is not None and v < 0:
        raise ValueError("custo não pode ser negativo")
    return v
```

Mesmo padrão já usado em `estoque_minimo`/`fator_conversao` (`ORD-183`/`ORD-184`).

### Cálculo de margem: frontend, não backend — decisão explícita
Diferente do `abaixo_do_minimo` (`ORD-183`), que dependia de `quantidade_atual` (só o servidor
tem), aqui `price` e `custo` já estão os dois no estado local do formulário. Calcular no frontend dá
o "ao vivo, sem salvar antes" pedido na história, sem round-trip:

```typescript
function calcularMargem(price: number, custo: number | null): { valor: number; percentual: number } | null {
  if (custo === null || custo === undefined) return null;
  const valor = Math.round((price - custo) * 100) / 100;
  const percentual = price > 0 ? Math.round((valor / price) * 100) : 0;
  return { valor, percentual };
}
```

### UI condicional (seção "Classificação fiscal")

```tsx
{editProd.cfop === "5102" && (
  <div className={styles.formRow}>
    <div className={styles.formRowField}>
      <CurrencyInput label="Custo" value={editProd.custo} onChange={(v) => setEditProd({ ...editProd, custo: v })} />
    </div>
    <div className={styles.formRowField}>
      {(() => {
        const margem = calcularMargem(editProd.price, editProd.custo);
        if (!margem) return <span className={styles.mutedText}>Informe o custo para ver a margem</span>;
        return (
          <Tag variant={margem.valor < 0 ? "error" : "success"}>
            {margem.valor < 0 ? "Margem negativa — este produto está sendo vendido abaixo do custo: " : "Margem de lucro: "}
            {margem.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ({margem.percentual}%)
          </Tag>
        );
      })()}
    </div>
  </div>
)}
```

`custo` continua no payload de `PUT` **independente** do CFOP selecionado no momento — é assim que
o valor sobrevive a uma troca de CFOP e volta quando o CFOP volta pra 5102.

### Riscos
Nenhum risco técnico relevante — campo aditivo, cálculo client-side sem chamada nova.

### Estimativa
**3 pontos confirmados.**

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

Upstream repassado formalmente por papel (PM, QA, backend):

**Explorer:** [x] história · [x] decisão de escopo (só CFOP 5102, margem nunca persistida) · [x]
posicionamento · [x] dependências (nenhuma) · [x] critérios de aceite. **Revisão de PM**: confirmou
custo>preço permitido (não bloqueado); achou arredondamento e texto de alerta não especificados —
corrigido.

**QA Explorer:** [x] happy path · [x] bordas (margem negativa, zero, custo negativo, troca de CFOP
preserva valor) · [x] cenários aprovados. **Revisão de QA**: achou falta de validação `custo >= 0`
— corrigido.

**Tech Explorer:** [x] migration, schema, decisão de cálculo client-side (justificada) · [x] riscos
— nenhum relevante.

**Status: Ready.** Sem dependência de nenhuma outra história do épico — pode ser implementada a
qualquer momento, inclusive antes do resto do Bloco F/A.
