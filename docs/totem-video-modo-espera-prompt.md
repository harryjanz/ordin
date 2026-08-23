# Totem — vídeo em modo espera (attract mode)

Status: ideia formal, ainda não implementada (ver `CLAUDE.md` do projeto e backlog do totem).

## Contexto

Hoje, quando o totem está ocioso (tela "aguardando cliente clicar em iniciar"),
a tela é estática. A proposta é trocar por um ou mais vídeos em loop nesse
momento, tornando a tela mais atraente e abrindo espaço para promoções e
campanhas de marketing enquanto ninguém está operando uma compra.

Este documento guarda o prompt de teste (tema Burger House) gerado para uso
em ferramentas de IA de vídeo (ex. Nano Banana), para já ter em mãos quando a
funcionalidade for implementada.

## Prompt de teste — Burger House

### Inglês (recomendado — geradores de vídeo costumam responder melhor)

```
Cinematic food commercial, vertical 9:16 orientation, seamless loop.
A gourmet cheeseburger from "Burger House" rotates slowly on a dark
wooden table under warm, dramatic side lighting. Thick juicy beef
patty with visible char-grill marks, melted cheddar cheese slowly
dripping down the sides, crispy lettuce, fresh tomato slices, toasted
brioche bun with a light golden glow. Steam rises gently from the
patty. In the background, soft bokeh of flickering flames from a
grill, warm amber and red tones. Camera does a slow, smooth orbit
around the burger, shallow depth of field, shallow focus pulls
occasionally to crispy golden french fries in a metal basket beside
it. Mood: appetizing, premium fast-food, inviting, energetic but not
rushed. No text, no logos, no people, no hands. Photorealistic,
high detail, 4K quality, restaurant advertising style, warm color
grading (amber/red/gold), subtle lens flare from grill flames.
Loopable motion — first and last frame should match for a seamless
repeat.
```

### Especificações recomendadas (colar junto do prompt, se a ferramenta pedir)

- Orientação: vertical 9:16 (totem normalmente é retrato)
- Duração: 6–10s, em loop
- Sem texto/logo embutido no vídeo — isso entra depois como overlay dinâmico
  (permite trocar a promoção sem regerar o vídeo)

### Português

```
Comercial de comida cinematográfico, formato vertical 9:16, loop
perfeito. Um hambúrguer gourmet da "Burger House" gira lentamente
sobre uma mesa de madeira escura, com iluminação lateral quente e
dramática. Carne suculenta e grossa com marcas visíveis de
grelhado, queijo cheddar derretido escorrendo pelas laterais,
alface crocante, fatias de tomate fresco, pão brioche tostado com
brilho dourado. Vapor sobe suavemente da carne. Ao fundo, chamas
de grelha desfocadas (bokeh), tons quentes de âmbar e vermelho.
Câmera faz uma órbita lenta e suave ao redor do hambúrguer,
profundidade de campo rasa, foco ocasional em batatas fritas
douradas e crocantes numa cesta de metal ao lado. Clima: apetitoso,
fast-food premium, convidativo, energético mas sem pressa. Sem
texto, sem logotipo, sem pessoas, sem mãos. Fotorrealista, alta
definição, 4K, estilo publicidade de restaurante, cor quente
(âmbar/vermelho/dourado), leve lens flare vindo das chamas da
grelha. Movimento em loop — primeiro e último frame devem
coincidir para repetição perfeita.
```

## Sugestões para a implementação futura

- **Playlist, não vídeo único**: suportar múltiplos vídeos em rotação, não
  apenas um arquivo fixo.
- **Interrupção imediata ao toque**: o vídeo não pode atrasar o início da
  compra — o toque do cliente precisa cortar direto para o fluxo de pedido.
- **Configurável por loja/tenant**: cada restaurante deve poder subir seus
  próprios vídeos/promoções, já que o ordin é multi-tenant.
- **Fallback para tela estática**: se a loja não configurar nenhum vídeo, a
  tela de espera atual continua funcionando normalmente.
- **Armazenamento**: definir onde os arquivos de vídeo ficam (S3/bucket por
  tenant?) e formato/tamanho aceito, considerando que o totem roda em
  hardware fixo e pode ter limitações de banda/armazenamento local.

## Referências

- Backlog do totem (memória do usuário): outras ideias de attract mode e
  achados de concorrência devem ser cruzados com este documento antes de
  virar história formal.
