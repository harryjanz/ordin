# Análise de concorrência — grupos de opção no cadastro de produto

Pesquisa (2026-08-31) motivada por uma mudança grande planejada no cadastro de produtos do Ordin: hoje `Product` é um registro plano (nome, preço, categoria), sem nenhum conceito de variação. Dois casos concretos levantados pelo usuário:

1. **"Refrigerante lata 350ml"** — produto único, escolha obrigatória de UM sabor entre Coca-Cola/Fanta Laranja/Fanta Uva/Guaraná, sem alteração de preço.
2. **"Batata frita"** — produto único, escolha obrigatória de UM tamanho entre P/M/G, com alteração de preço por tamanho.

Hoje, cadastrar isso no Ordin exige 4 produtos separados pro refrigerante e 3 pra batata — não é o que se quer: um produto só, com as opções configuradas dentro dele.

## Como o mercado resolve isso

| Player | Termo usado | Fonte |
|---|---|---|
| Goomer | "Opcionais" / "Seletor de Opções" | [ajuda.goomer.com.br](https://ajuda.goomer.com.br/goomergo/painel/cardapio/opcionais/criar-opcionais) |
| iFood | "Grupo de Complementos" (`optionGroups`) | [developer.ifood.com.br](https://developer.ifood.com.br/pt-BR/docs/guides/modules/catalog/definitions) |
| Anota AI | "Adicionais" / "grupo de adicionais" | [anota.ai/ajuda](https://anota.ai/ajuda/cardapio/) |
| CardápioWeb | sem fonte primária direta (inferência via ecossistema Datacaixa) | — |
| Mogo | só fluxo de pizza documentado publicamente | — |

**Terminologia não é unânime** — cada player tem seu vocabulário ("opcionais", "complementos", "adicionais"), mas o mecanismo por baixo é o mesmo em todos os três com fonte confirmada.

### O mecanismo (confirmado, schema real do iFood)

```json
"optionGroups": [{ "name": "Escolha um sabor", "min": 1, "max": 1, "optionIds": [...] }],
"options": [{ "productId": "coca-lata", "price": {"value": 0} }, { "productId": "fanta-lata", "price": {"value": 0} }]
```

- **Grupo** com `min`/`max`: `min ≥ 1` = obrigatório, `max = 1` = seleção única (múltipla se `max > 1`)
- **Cada opção** tem preço próprio — pode ser **zero** (caso do refrigerante) ou **diferente** (caso da batata P/M/G) — é o **mesmo campo**, só o valor muda
- **Grupo é reutilizável**: Goomer (associar o mesmo opcional a vários produtos, edição propaga), iFood (copiar grupo existente), Anota AI ("Importar Grupo") — os três confirmam que o padrão de mercado é cadastrar "Sabores de refrigerante" **uma vez** e reaproveitar em lata, garrafa 600ml etc., não recriar por produto

### Achado central: os dois exemplos do usuário são o mesmo mecanismo

Não existe, em nenhum dos players com fonte confirmada, um mecanismo estrutural diferente pra "grupo de sabor" vs. "grupo de tamanho". É o **mesmo primitivo** — grupo de opções com obrigatoriedade + seleção única/múltipla + preço por opção (que pode ser zero) — configurado com valores diferentes. A única exceção é um fluxo **dedicado de pizza** (Anota AI, Mogo), que é otimização de UX pra um caso combinatório específico (fração de sabores por tamanho), não evidência de mecanismo geral diferente.

## Implicação pro modelo de dado do Ordin

Isso reabre e generaliza a análise anterior (`docs/analise-priorizacao-combo-modificadores.md`, 22/08), que tinha separado "variantes de tamanho" (prioridade baixa, tratado como "3 produtos separados, falta só UX de agrupamento") de "modificadores/complementos" (prioridade adiada, mais caro, mexe em impressão). A pesquisa de mercado mostra que **um único primitivo de "grupo de opções"** cobre os dois exemplos do usuário (sabor E tamanho) — não são dois problemas, é um.

Ponto em aberto pro Explorer, não resolvido aqui: como esse grupo de opções se relaciona com `OrderItem`/`Ticket` no order-service. Duas abordagens possíveis, ambas com precedente de mercado:
- **Opção A (iFood-like):** cada opção do grupo referencia um `product_id` próprio (a opção "Coca-Cola lata" É um Product) — a linha do pedido vira o produto-opção escolhido, reaproveitando 100% do modelo atual de `OrderItem`/`Ticket`, sem mudar impressão nem balcão.
- **Opção B (Goomer/Anota AI-like):** a opção é um valor dentro do grupo, não um Product próprio — a linha do pedido carrega o produto-pai + a opção escolhida como atributo, exigindo campo novo em `OrderItem` e mudança no `printService.ts` (mesmo custo que a análise anterior atribuiu a "modificadores").

A Opção A é estruturalmente mais barata pro Ordin hoje (mesmo argumento que já valeu pra combo: reaproveita `OrderItem` sem tocar order-service/impressão/balcão) e é exatamente como o iFood modela via API. Fica como recomendação técnica preliminar pro Tech Explorer avaliar, não decisão fechada aqui.

## Próximos passos sugeridos
Não é Explorer ainda — é insumo pra decidir se abre um Explorer de "grupo de opções no cadastro de produto" como item novo (substituindo/absorvendo os antigos "variantes de tamanho" e parte de "modificadores" do backlog adiado), e em que ordem em relação ao combo/bundle (ORD-112, hoje parado).
