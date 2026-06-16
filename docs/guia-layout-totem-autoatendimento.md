# Guia de layout — Totem de autoatendimento fast food
> Referência baseada nos padrões de Burger King e McDonald's para revisão e diagramação de totens (kiosks) de self-service.

---

## 1. Hardware e resolução

| Atributo | Valor |
|---|---|
| Resolução padrão | 1080 × 1920 px (portrait) |
| Tamanho mínimo de tela | 21" (menor) / 31.5" (Burger King) / 32"+ (McDonald's) |
| Orientação | Retrato (portrait) — vertical |
| PPI em tela de 21" | ~104 PPI |
| PPI em tela de 32" | ~68 PPI |
| Altura de interação segura | Entre 90 cm e 150 cm do chão |

**Ponto de atenção:** A mesma arte em 1080 × 1920 px renderiza em escalas físicas diferentes dependendo do tamanho da tela. Sempre valide os tamanhos em milímetros, não apenas em pixels.

---

## 2. Zonas do layout (estrutura de telas)

O layout vertical do totem se divide em 5 zonas funcionais:

```
┌─────────────────────────────┐
│   ZONA 1 — Header           │  ~72px
│   Logo + promoção + idioma  │
├─────────────────────────────┤
│   ZONA 2 — Categorias       │  ~52px
│   Scroll horizontal de abas │
├─────────────────────────────┤
│                             │
│   ZONA 3 — Grid de produtos │  ~650px
│   2 colunas, scroll vertical│
│                             │
├─────────────────────────────┤
│   ZONA 4 — Carrinho         │  ~100px
│   Resumo + CTA finalizar    │
├─────────────────────────────┤
│   ZONA 5 — Rodapé           │  ~80px
│   Consumo local / viagem    │
└─────────────────────────────┘
```

### Zona 1 — Header
- Logo da marca no canto superior esquerdo
- Banner/destaque promocional ocupando o espaço central (evitar poluição — BK removeu banners do home após pesquisa com usuários)
- Seletor de idioma e acessibilidade no canto superior direito

### Zona 2 — Barra de categorias
- Scroll **horizontal**
- Categoria ativa com indicador visual claro (sublinhado ou fundo diferenciado)
- Itens: Lanches · Combos · Bebidas · Sobremesas · Extras
- Não ultrapassa 52–60 px de altura

### Zona 3 — Grid de produtos
- **2 colunas** como padrão; 3 colunas apenas em telas maiores (32"+)
- Cada card tem: foto (60–70% da altura do card) + nome do produto + preço + botão de adicionar
- Scroll vertical nessa zona
- Imagens grandes e apetitosas — McDonald's usa recorte dramático (exaggerated cropping); BK usa estética flamejada

### Zona 4 — Carrinho / resumo
- **Sempre visível** durante a navegação no menu
- Exibe número de itens e subtotal em tempo real
- CTA principal "Ver pedido e finalizar" centralizado ou à direita
- Altura mínima de 90–100 px

### Zona 5 — Rodapé
- Seleção de modalidade: Salão · Viagem · Número da mesa
- Ícones de formas de pagamento aceitas
- Mantido fixo, não scroll

---

## 3. Tamanhos de botões e alvos de toque

| Elemento | Tamanho mínimo | Recomendado |
|---|---|---|
| Alvo de toque (W3C) | 20 mm / ~82 px (em 21") | — |
| Botão padrão (touch target) | 48 × 48 px | 60 × 60 px+ |
| CTA principal (ex: "Finalizar") | — | altura ≥ 120 px |
| Distância entre botões | 5 mm / ~21 px | 8 mm+ |
| Botão de adicionar item | — | ≥ 80 × 80 px |

**Regras:**
- Botões devem ser grandes o suficiente para dedos de diferentes tamanhos, incluindo idosos e pessoas com limitações motoras
- As **ações principais ficam no lado direito** da tela (favorece usuários destros, que são a maioria)
- Botões "Voltar" e "Início" devem estar sempre visíveis e em posição consistente
- Espaçamento generoso evita cliques acidentais em telas grandes

---

## 4. Tipografia

### Escala recomendada para tela de 21" (104 PPI)

| Nível | Uso | Tamanho em px | Equivalente físico |
|---|---|---|---|
| H1 | Instrução principal por tela | 38–42 px | ~8 mm na tela |
| H2 | Subcabeçalho / instrução secundária | 23–26 px | ~5–5.6 mm |
| Label de botão (função principal) | Texto de CTAs primários | 23–26 px | ~5.6 mm |
| Label de botão (primário) | Ações secundárias | 18–20 px | ~4.4–4.9 mm |
| Texto de corpo / descrição | Info do produto | 16–18 px | ~4 mm |
| Tamanho mínimo absoluto | Qualquer texto visível | 14 px | ~3.5 mm |

### Fontes recomendadas
- **Lexend** — comprovada em pesquisas para melhorar legibilidade em telas de alto tráfego
- **Burger King:** Flame (fonte proprietária da marca) + sans-serif bold
- **McDonald's:** Speedee (fonte proprietária) + bold sans
- Para projetos sem fonte proprietária: usar sans-serif bold com alto x-height (Roboto, Inter, Plus Jakarta Sans)

### Boas práticas tipográficas
- Peso mínimo: **Bold (700)** para labels e instruções — evitar regular em telas brilhantes
- Contraste mínimo: 4.5:1 (WCAG AA); preferir 7:1 para instruções principais
- Nunca usar itálico em elementos interativos
- Preço do produto: fonte bold, tamanho ≥ H2, cor de destaque

---

## 5. Hierarquia visual e distribuição de elementos

### Card de produto
```
┌────────────────────────┐
│                        │
│     Imagem do produto  │  60–70% da altura
│     (foto grande)      │
│                        │
├────────────────────────┤
│  Nome do produto       │  H2 bold
│  Descrição curta       │  corpo pequeno
│  R$ 00,00     [  + ]  │  preço + botão add
└────────────────────────┘
```

- Imagem ocupa a parte superior do card
- Nome e preço na parte inferior
- Botão de adicionar ("+") no canto inferior direito do card
- Badges promocionais ("Novo", "Mais vendido") no canto superior esquerdo da imagem

### Hierarquia de cor para ações
1. **CTA primário** (Finalizar pedido, Confirmar): cor de destaque da marca, alto contraste
2. **CTA secundário** (Adicionar item, Continuar): cor secundária ou outline
3. **Ação destrutiva/neutro** (Remover, Cancelar): cinza ou vermelho suave
4. **Pular / Skip**: texto simples, sem botão proeminente

---

## 6. Fluxo de telas recomendado

```
[1. Boas-vindas]
    "Toque para começar"
         ↓
[2. Tipo de pedido]
    Salão · Viagem · Mesa
         ↓
[3. Login / fidelidade] ← opcional, skippable
    CPF · Clube de pontos
         ↓
[4. Menu principal]
    Categorias + grid de produtos
         ↓ (ao adicionar item)
[5. Customização do item]
    Ingredientes · Tamanho · Extras
         ↓
[6. Cross-sell — 1 tela apenas]
    Sugestão relevante à categoria
         ↓ (ao finalizar seleção)
[7. Revisão do carrinho]
    Editar · Remover · Confirmar
         ↓
[8. Pagamento]
    Cartão · PIX · Dinheiro
         ↓
[9. Confirmação]
    Número do pedido · Ticket impresso
```

### Boas práticas de fluxo
- Mínimo de telas e taps necessários para concluir o pedido
- Indicador de progresso visível ("Passo 2 de 4")
- Nunca bloquear o usuário sem saída clara
- Botão "Início" sempre acessível

---

## 7. Padrões de UX — lições de pesquisa

### Problemas identificados nas redes (pesquisa com usuários reais)

| Problema | Causa | Solução aplicada |
|---|---|---|
| Usuários ignoram o login | Não entendem o benefício | Login simplificado + skippable, com proposta de valor clara |
| 3 telas de cross-sell consecutivas | Excesso de interrupções | Reduzir para 1 pop-up com item relevante à categoria |
| Combo builder com 15 interações | Fluxo fragmentado e redundante | Montar o combo inteiro em 1 única tela |
| Banners promocionais ignorados | Poluição visual no home | Remover banners da tela inicial; usar destaque pontual |
| Pop-ups espontâneos irritantes | Quebram o fluxo de pedido | Cross-sell integrado à tela do item, não em pop-up separado |

### Princípios de usabilidade aplicados

**Simplicidade e clareza**
- Cada tela deve ter uma instrução principal clara ("Toque para começar", "Escolha seu lanche")
- Elementos interativos devem ser óbvios — indicar visualmente que a tela é touch
- Menos opções por tela = menos paralisia de decisão

**Feedback imediato**
- Confirmação visual a cada ação (item adicionado ao carrinho, seleção marcada)
- Usar ícones de check, animações sutis e texto de confirmação ("Adicionado!")
- Sem áudio obrigatório — depender de feedback visual

**Consistência**
- Mesmos padrões de botão, cor e terminologia em todas as telas
- Sistemas de terceiros (pagamento, fidelidade) devem seguir o mesmo design system
- Posição de "Voltar" e "Avançar" sempre no mesmo lugar

**Acessibilidade**
- Contraste alto para daltonismo
- Ícones universais acompanhados de texto
- Opção de áudio/acessibilidade visível no header
- Layout funcional para usuários de cadeira de rodas (interação focada entre 90–120 cm)

---

## 8. Diretrizes de cor e identidade visual

### Burger King
- Paleta: laranja (#F5A623) + preto (#1A1A1A) + branco
- Background: escuro (preto ou dark brown)
- Estética: flamejada, ousada, contrastante
- Imagens: dramáticas com tratamento de cor quente

### McDonald's
- Paleta: vermelho (#DA291C) + amarelo (#FFC72C) + branco
- Background: claro (branco ou cinza muito claro)
- Estética: limpa, moderna, confiante
- Imagens: recorte exagerado ("exaggerated cropping"), fundo neutro ou gradiente suave

### Princípios gerais de cor
- Cor guia o olhar — use-a para criar contraste entre CTA e fundo
- Cor de ação primária deve ser única na tela (evitar competição visual)
- Nunca usar apenas cor para comunicar estado (considerar daltonismo) — acompanhar com ícone ou texto
- Background de cards de produto: preferencialmente escuro ou neutro para valorizar a imagem

---

## 9. Upsell e personalização inteligente

- **McDonald's** usa análise de dados comportamentais para sugerir itens de acordo com perfil do usuário, horário do dia e localização
- Sugestões baseadas em A/B testing contínuo de layouts, posição de botões e visuais de produto
- Prompts de upsell com imagem são mais eficazes que texto simples
- Sugestões devem parecer úteis, não invasivas — relevância é tudo
- Posição ideal para upsell: na tela do item customizado, não em pop-up separado

---

## 10. Checklist de revisão de layout

Use este checklist ao revisar cada tela do totem:

### Estrutura
- [ ] As 5 zonas (header, categorias, grid, carrinho, rodapé) estão definidas?
- [ ] O carrinho/subtotal está sempre visível?
- [ ] O CTA principal está no lado direito e em destaque?
- [ ] Existe botão "Início" acessível em todas as telas?

### Tipografia
- [ ] H1 de instrução principal ≥ 38 px?
- [ ] Labels de botão ≥ 18 px?
- [ ] Nenhum texto abaixo de 14 px?
- [ ] Contraste texto/fundo ≥ 4.5:1?

### Botões e toque
- [ ] Todos os alvos de toque ≥ 20 mm (≥ 82 px em 21")?
- [ ] Espaçamento entre botões ≥ 5 mm?
- [ ] CTA principal com altura ≥ 120 px?
- [ ] Ações destrutivas (remover) diferenciadas visualmente?

### Fluxo
- [ ] É possível finalizar o pedido em ≤ 5 taps após entrar no menu?
- [ ] Cross-sell limitado a 1 tela?
- [ ] Login é skippable?
- [ ] Combo builder cabe em 1 tela?

### Acessibilidade
- [ ] Interação concentrada entre 90 cm e 150 cm do chão?
- [ ] Ícones acompanhados de texto?
- [ ] Opção de acessibilidade no header?
- [ ] Feedback visual claro a cada ação?

### Imagens e produto
- [ ] Foto do produto ocupa 60–70% do card?
- [ ] Preço em destaque (bold, ≥ H2)?
- [ ] Botão de adicionar item facilmente identificável?

---

## Referências

- Burger King self-service kiosk UX case study — blessque.com
- Designing a Self-Ordering Kiosk UI — QSR Magazine (King-Casey)
- Self-Service Kiosk Design and UI Tips — Hashmato
- User Interface Design for Kiosks — Frank Mayer & Associates
- Kiosk UI Design Notes — Medium (cálculo de px/mm para acessibilidade)
- McDonald's Global Digital Design System — Adam Augustyn
- Automation of Burger King Restaurants: Self-Service Kiosks — Ordering Stack
