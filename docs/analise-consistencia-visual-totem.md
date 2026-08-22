# Auditoria de consistência visual do totem vs. escala do design-system

Continuação de `docs/estudo-design-system-totem.md` (que concluiu: não dá pra importar os *componentes* do DS pro totem por causa da cor de marca compilada em build-time, mas dá pra aproveitar a *disciplina de escala* — espaçamento, radius, tipografia). Este documento faz o levantamento concreto: quanto o totem hoje se afasta de uma escala formal, e o que uma escala pro totem deveria ser (não uma cópia literal da do DS — justificado abaixo). **Levantamento, não história.**

## Metodologia
Grep de todos os valores literais de `borderRadius`, `fontSize` e `padding` usados inline nas 9 telas de `frontend/totem/src/screens/*.tsx` (o totem estiliza tudo via objetos de estilo inline por tela, não CSS Modules como o admin — ver `themes.ts`). Contei ocorrências pra ver o que já é "de facto" um padrão (repetido) vs. valor único inventado na hora.

## Achado 1 — `borderRadius`: 9 valores distintos, mas já existe um padrão de facto
```
19×  12px      15×  999px (pill)    5×  8px      4×  16px
3×   24px      1×   cada de 4/10/14/18px
```
`12px` e `999px` (pill total, usado em CTAs e no modal de inatividade) já são o padrão dominante — a cauda longa (4, 8, 10, 14, 16, 18, 24) é ruído: provavelmente cada tela reinventou um valor "parecido" sem checar o que as outras já usavam.

## Achado 2 — `fontSize`: 22 valores distintos, sem escala nenhuma
```
10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 36, 38, 42, 44, 46, 48, 52, 56, 100
```
Isso é o problema mais sério dos três — 22 tamanhos de fonte é o tipo de coisa que, junto (não em uma tela isolada), passa uma sensação de inconsistência mesmo que cada tela individualmente pareça bem cuidada. `13`, `15`, `17`, `19` em particular são "quase" `12`, `14`, `16`, `18` — sugerem drift acidental (alguém ajustou 1px no olho), não decisão de design.

## Achado 3 — `padding`: dezenas de combinações, sem ritmo (8px, 4px ou outro)
Amostra: `"0 28px"`, `"20px 0"`, `"32px 0 24px"`, `"8px 12px"`, `"48px 0"`, `"40px 48px"`, `"20px 28px"`, `"12px 20px"`, `"6px 22px"`, `"2px 7px"`... — números ímpares como `7px`, `22px`, `28px` aparecem ao lado de `24px`/`20px`/`16px`, sem um incremento base identificável.

---

## O que a escala do design-system oferece (referência, não cópia)

### Tipografia — `$fonts`: **10 → 12 → 14 → 16 → 20 → 26 → 38 → 52 → 60**
Escala limpa, cada degrau com variante `-emphasys` (peso maior) no mesmo tamanho. Boa referência de *ritmo* pros tamanhos pequenos/médios do totem (13/15/17/19 deveriam ter virado 12/14/16/20, não ficado no meio do caminho). Mas o totem **precisa de degraus que o DS não tem**: o maior valor do DS é 60px, o totem já usa 100px (título de tela cheia, visto a distância no quiosque) — o DS foi desenhado pra um painel administrativo visto de perto (30-50cm), não pra uma tela de totem vista de 60cm-1m com necessidade de leitura rápida. **Recomendação:** adotar os degraus pequenos/médios do DS (10/12/14/16/20/26) como piso comum de consistência entre admin e totem, e estender uma escala própria acima disso (ex: 38 → 52 → 64 → 80 → 100) pros títulos grandes específicos do totem.

### Radius — `$borders-radius`: **4px pra tudo** (button, input, card, checkbox — um valor só, não uma escala)
Aqui a resposta é **não adotar**. `4px` é uma escolha de design de ferramenta administrativa densa, para mouse/teclado. Toda a pesquisa de concorrência feita nesta sessão (Goomer, Gototem, e o próprio inventário visual do totem) usa cantos generosamente arredondados em interfaces de toque — é padrão de UX estabelecido (alvo de toque parece mais convidativo/"tocável" com raio maior; ver também os próprios protótipos históricos do totem em `docs/design-system-totem*.html`, todos usando radius grande). Adotar `4px` no totem seria uma regressão visual, não uma melhoria — description contrária ao "visualmente melhor" que é o objetivo desta frente.
**Recomendação:** manter a filosofia arredondada do totem, mas consolidar a cauda longa (4/8/10/14/16/18/24) em **3 níveis formais**, usando os valores que já são de facto dominantes: `12px` (padrão — cards, campos, teclas), `999px` (pill — CTAs primários, badges), e um terceiro nível maior (`20px`, escolhido por ficar equidistante entre o `16px` e `24px` já usados) pra painéis/modais grandes.

### Espaçamento — `$spacing`: **ritmo de 8px** (4, 8, 16, 24, 32, 40, 48, 56, 64...)
Diferente do radius, aqui **vale adotar** — é uma prática de mercado sólida e independente de contexto (touch ou desktop, o ritmo de 8px organiza qualquer grid). **Recomendação:** todo `padding`/`margin` novo ou revisado no totem passa a usar só valores dessa escala (trocar `"6px 22px"` por `"8px 24px"`, `"2px 7px"` por algo como `"4px 8px"`, etc.) — sem precisar importar o pacote, só adotar a disciplina.

---

## Proposta de escala consolidada pro totem (não é a escala do DS, é inspirada nela)
| Categoria | Escala proposta | Fonte da decisão |
|---|---|---|
| Radius | `12px` (padrão) · `20px` (painel/modal grande) · `999px` (pill/CTA) | Consolidação dos valores já dominantes no totem — DS descartado aqui de propósito |
| Espaçamento | `4·8·16·24·32·40·48·56·64·72·80·88·96` | Ritmo de 8px do DS, adotado como disciplina |
| Tipografia (piso comum) | `10·12·14·16·20·26` | Escala pequena/média do DS |
| Tipografia (extensão totem) | `38·52·64·80·100` | Necessidade própria do totem (títulos de tela cheia) — acima do teto do DS (60px) |

## Próximos passos sugeridos
Isso ainda é auditoria, não história. Formalizar essas 4 escalas como constantes em `themes.ts` (ou um novo módulo `scale.ts`) e depois revisar tela por tela trocando os valores ad-hoc pelos da escala é o trabalho de implementação em si — cabe rodar o upstream (Explorer → QA Explorer → Tech Explorer → Ready) antes, mesmo sendo "só CSS", porque toca as 9 telas do totem e vale ter critério de aceite claro (ex: "nenhum valor de radius/fontSize fora da escala definida") em vez de revisão solta.
