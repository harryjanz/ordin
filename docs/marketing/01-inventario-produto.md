# 01 — Inventário de Produto (Ordin / FoodKiosk)

**Fase:** 1 — Levantamento · **Status:** rascunho para aprovação
**Metodologia:** leitura integral de código (não documentação de intenção) por 4 agentes de exploração, cada um cobrindo um domínio: (1) pedido/cardápio/cozinha, (2) pagamento/fiscal, (3) multi-loja/admin/comercial, (4) totem/balcão/infra. Toda afirmação abaixo cita arquivo e, quando relevante, função/linha. Nada aqui foi inferido de documentação de arquitetura-alvo — só do que o código faz hoje.

**Convenção de rótulo:**
- Sem rótulo = completo, implementado e testado — seguro para o site afirmar sem qualificação.
- **[EXPERIMENTAL]** = código real e ativo, mas com lacuna, limitação documentada ou cobertura de teste incompleta — pode ir ao site, mas com linguagem qualificada, não como afirmação absoluta.
- **[MOCK]** = existe um fluxo real de verdade, mas o que roda hoje por padrão em alguns contextos é uma simulação — não pode ser citado como integração real sem essa ressalva.
- **[ROADMAP]** = documentado como visão futura ou ausente por completo — **não pode aparecer no site** como feature disponível.

---

## 1. Fluxo de pedido

`services/order/main.py`

- Pedido criado via `POST /orders` (`create_order`, `main.py:377-419`). Gera `order_ref` (formato `P` + 6 dígitos), calcula total, grava tipo de consumo (local/viagem) e nome de retirada opcional.
- **1 ticket por unidade de item**, confirmado no loop `for u in range(1, item.qty+1)` (linha 408) — cada unidade recebe `ticket_code` próprio de 8 caracteres.
- **QR assinado com HMAC-SHA256**, dois formatos:
  - Ticket individual: `{ticket_code}|{product_name}|{order_ref}|{timestamp}|{HMAC}` (`_make_qr_data`, linhas 332-342, verificado com `hmac.compare_digest`).
  - Pedido inteiro (retirada única): `ORDER|{ref}|{timestamp}|{HMAC}` (`_make_order_qr_data`/`_verify_order_qr`, linhas 356-368).
- **Coleta com proteção contra dupla coleta**: `POST /tickets/{ticket_code}/collect` usa `SELECT ... FOR UPDATE` (linha 464) + checagem de status já coletado → `409`. Também existe coleta manual sem QR, com evento de auditoria.
  - **[EXPERIMENTAL]** — a proteção existe no código, mas não há teste automatizado que exercite o cenário de coletar o mesmo ticket duas vezes em paralelo (busca completa em `tests/` sem resultado). O comportamento está lá; a garantia por teste não.
- **Coleta de pedido inteiro** (modelo retirada única, `POST /orders/{order_ref}/collect`) — coleta todos os tickets de uma vez, mesmo padrão de lock.
- **Fechamento automático**: pedido vira `completed` quando `collected == total` — não existe transição manual para completed.
- **Status possíveis**: `pending, paid, ready, completed, cancelled` (`ORDER_STATUSES`, linha 44).
  - **[EXPERIMENTAL]** — `cancelled` existe no enum e no endpoint genérico de update de status, mas não há fluxo de negócio dedicado (sem reversão automática de estoque associada a esse caminho específico).

## 2. Tempo real (WebSocket)

`services/order/websocket.py`

- `ws://.../ws/orders?company_id=<id>` — multi-tenant real: conexões mantidas em `dict[company_id, list[WebSocket]]`, broadcast restrito à empresa.
- Eventos emitidos: `order.created`, `order.paid`, `ticket.collected`, `order.ready`, `order.completed`.
- **Heartbeat confirmado**: servidor aguarda até 30s por mensagem do cliente; sem resposta, envia `{"type":"heartbeat"}`; responde `ping` com `pong`.

## 3. Cozinha / KDS

**Não existe.** Busca explícita por "cozinha"/"kitchen"/"kds"/"em preparo" em `order/main.py`, `catalog/main.py` e `websocket.py` — zero ocorrências.

O que existe de fato:
- `POST /orders/{order_ref}/ready` — transição manual **paid → ready**, um botão único que marca o pedido inteiro como pronto, sem rastreamento de progresso por item.
- `GET /orders/prep-stats` — métrica analítica (tempo médio entre pago e pronto), não uma ferramenta operacional de preparo.
- O próprio código documenta que o order-service é "deliberadamente agnóstico" a como essa etapa é exibida.

**Conclusão:** o sistema vai de **pago direto para "pronto para retirada"**, sem etapa granular de acompanhamento de preparo por item. **[ROADMAP]** — qualquer menção a "KDS" ou "painel de cozinha" no site seria promessa não sustentada pelo código; não incluir nem como "em breve" sem confirmação explícita de roadmap com o time de produto.

## 4. Cardápio — estrutura

`services/catalog/main.py` (6039 linhas) — todos com CRUD completo, isolamento multi-tenant e teste dedicado, salvo exceção anotada:

| Elemento | Modelo | Observação |
|---|---|---|
| Categorias | `Category` | reordenável |
| Produtos | `Product` | CRUD + imagem + reorder |
| Grupos de opção ("escolha o sabor") | `OptionGroup`/`Option` | min/max de seleção, override por produto (ORD-144) |
| Combos | `Combo`/`ComboItem` | ativar/desativar com checagem de componente inativo |
| Produtos correlacionados (cross-sell) | `RelatedProduct` | ver ressalva abaixo |
| Upsell de combo | `Combo.upsell_enabled`/`ComboItem.triggers_upsell` | dado exposto, decisão de exibição é do frontend |
| Promoções por período | `Promotion`/`PromotionItem` | detecção de conflito de período via lock |

**[ROADMAP] parcial** — produtos correlacionados/upsell: o backend só expõe os **dados** (lista ordenada, flags); não existe motor de recomendação nem endpoint de "sugestões automáticas". Vender como "dados prontos para exibir sugestões cruzadas", nunca como "motor de recomendação inteligente" ou IA.

## 5. Cardápio — regras especiais

- **Cardápio por horário** (`Menu`/`MenuCategory`/`MenuProduct`, dias da semana + janela de horário) — implementado e ativo em produção (`_is_menu_active_now`).
  - **[EXPERIMENTAL]** — duas limitações documentadas no próprio time (`docs/stories/ORD-127-...md`): usa UTC do servidor, sem fuso horário por empresa; e não cobre janelas que cruzam a meia-noite (ex. 22h–02h). Além disso, **nenhum teste automatizado** foi encontrado cobrindo esse comportamento, apesar do status "Done" na história — testado só manualmente.
- **Estoque/disponibilidade** — completo e bem testado: bloqueio automático de produto esgotado no totem, checagem de disponibilidade pré-checkout, baixa automática na aprovação do pagamento, histórico de movimentação.
- **Alérgenos** — tabela oficial RDC 727/2022, implementada e testada.
- **Informação nutricional** — **[EXPERIMENTAL]/parcial**: só existe o campo `calories` (kcal). Não há tabela nutricional completa (proteína, carboidrato, sódio). Usar "exibição de calorias por item", nunca "informação nutricional completa".
- **Imagens de produto/opção/combo** — completo: upload com thumbnail automático, validação de tipo/tamanho, URL assinada temporária (nunca expõe a key crua).

## 6. Pagamentos

`services/payment/main.py` + `infrastructure/providers/`

- **PayGo** — integração HTTP real contra a API ControlPay/PayGo (venda, polling até 90s, cancelamento, teste de conexão). **O CLAUDE.md do projeto está desatualizado** ao chamá-lo de "mockado 95%" — esse é um provider **separado** (`MockProvider`), usado só quando o terminal está configurado para isso.
  - **[EXPERIMENTAL]** — reembolso via API PayGo não existe (`NotImplementedError` proposital); só cancelamento no mesmo dia. Webhook PayGo é placeholder ("estrutura a confirmar com ControlPay").
- **Mercado Pago** — integração real e completa: cartão via MP Point (API Orders), PIX com QR code, reembolso real (janela 90/180 dias), webhook com verificação de assinatura HMAC por empresa. **Validado com transação real ao vivo** (`docs/stories/ORD-130-...md`, cobrança real de R$1,00 aprovada).
- **[MOCK]** — `MockProvider`: aprovação por `random.random() < 0.95`, usado só quando o terminal está configurado explicitamente sem maquininha real (dev/demo).
- **PayGo é genuinamente multiadquirente — achado de pesquisa externa (2026-09-30), não estava nos agentes de código originais**: o terminal GPOS780 (Gertec) aceita como adquirente configurada **Cielo, GetNet, PagSeguro, Rede, Safra e Vero**; o terminal P3 (Sunmi) aceita Cielo, Rede e Alelo (fonte: `paygodev.readme.io/docs/terminais-compatíveis`, via WebSearch). Isso significa que a integração PayGo já implementada no Ordin **não é "1 adquirente a mais"** — é uma ponte real pra pelo menos 6 adquirentes diferentes, incluindo PagSeguro/PagBank (~17% do mercado) que, pelo caminho direto (Moderninha/PlugPag), está fora do padrão de arquitetura atual (ver nota logo acima). **Nuance importante pra não confundir**: isso preserva a **relação com a adquirente** (ex: contrato Cielo/Rede do cliente), não necessariamente **o aparelho físico específico** que o cliente já tem na mão — na prática ele receberia um terminal compatível com PayGo (GPOS780/P3), configurado pra continuar liquidando com a adquirente que ele já usa.
- **Stone e Adyen, ao contrário do que se poderia supor, NÃO são multiadquirente** — confirmado via pesquisa externa (2026-09-30): "Stone Connect é exclusiva da Stone, não sendo uma solução multiadquirente" (a própria Stone contrasta isso com TEF genérico); Adyen atua como adquirente própria no Brasil (liquidação via parceria com Banco Bonsucesso), não como ponte pra outras adquirentes. Integrar Stone ou Adyen soma **só** a rede de cada uma, não abre acesso a outras.
- **Dinheiro** — **não existe** no enum `PaymentMethod` (só credit/debit/pix/voucher); sem fluxo de caixa/troco.
- **Stone** — **[ROADMAP] decidido, não "zero pesquisa" como uma versão anterior deste documento registrou por engano.** Decisão formal de implementar já tomada (2026-09-05, `docs/analise-stone-modelo-integracao.md`), arquitetura C4 completa mapeada contra `api.pagar.me` (a Stone adquiriu a Pagar.me e reaproveita a API dela), webhook `charge.paid`/`charge.refunded` confirmado como mecanismo nativo real (push, não polling — mais moderno que o PayGo atual). Falta só resposta do suporte Stone a 3 pontos bloqueantes (assinatura de webhook, sandbox de cartão, escopo de credencial) antes de abrir Tech Explorer. **Zero linha de código ainda — não citar como "integrado" até isso mudar.**
- **Adyen** — mesmo status de maturidade que a Stone: decisão registrada na mesma data, "candidata forte", com dois pontos que travaram tanto PayGo quanto Stone já resolvidos na doc oficial (assinatura de webhook HMAC-SHA256 documentada, reembolso 100% via backend sem depender do terminal físico). **Zero linha de código ainda.**
- **PagBank/Moderninha e InfinitePay — pesquisados e descartados do modelo atual, achado relevante pra qualquer claim de "qualquer maquininha":** PagBank não oferece API de nuvem — é SDK nativo local via Bluetooth (PlugPag), exigiria uma peça de arquitetura inteiramente nova (agente local rodando perto do totem). InfinitePay não tem API pra acionar remotamente um terminal físico separado (só deeplink no mesmo aparelho). **Nenhum dos dois cabe no padrão "API em nuvem + webhook" que PayGo/MP/Stone/Adyen compartilham** — isso importa porque PagBank sozinho representa ~17% do mercado de adquirência por volume (ver `02-concorrencia-matriz.md`), uma fatia real que fica de fora de qualquer promessa de compatibilidade universal.
- **Estorno automático real** — confirmado: quando a baixa de estoque pós-pagamento falha, o sistema reembolsa (MP) ou cancela (PayGo) automaticamente, sem intervenção humana, com 14 testes dedicados.
- **Notificação order-service** — HTTP PATCH síncrono, best-effort (falha só loga, não derruba o pagamento). Eventos de fila (`payment.approved` etc.) são publicados de verdade via RabbitMQ, mas **nenhum consumidor existe no repositório** — a sincronização real é via HTTP, a fila é infraestrutura de auditoria/futuro.

## 7. Fiscal (NFC-e)

- **Emissão real de NFC-e por pedido** via Focus NFe (`emit_nfce_if_active`), não só cadastro de empresa: monta payload com NCM/CFOP/CST calculado por regime tributário, emite após cada pagamento aprovado, com reconciliação automática de notas pendentes (job em até 24h) e cancelamento dentro da janela de 30 min.
- **Add-on fiscal com cobrança separada** confirmado: `FiscalAddonPlan` (mensalidade + preço por documento emitido) é uma dimensão de cobrança distinta da `PriceTable` do totem.
- **[EXPERIMENTAL]** — ambiente "mockup" existe (gera chave fake via hash, sem validade fiscal), usado só para preview de layout de DANFE, controlado por flag explícita. Campos como `cpf_destinatario` têm comentário de "não confirmado ainda contra teste real". **[ROADMAP]** — arquitetura fiscal multi-provedor (mais de um emissor de nota) é decisão consciente adiada; hoje só Focus NFe existe.

## 8. Multi-tenant / "multi-loja"

`services/company/main.py`

- Isolamento real por `company_id`, com checagens explícitas em quase todo endpoint e teste dedicado de isolamento (`test_isolation.py`).
- Uma `Company` pode ter **N `Terminal`** (pontos físicos/totens) — CRUD completo, conflito de dispositivo checado entre terminais da mesma empresa.
- **[ROADMAP] — atenção ao termo "multi-loja"**: o modelo é **1 `Company` (1 CNPJ, 1 endereço) → N terminais**, não múltiplas unidades/filiais com CNPJ e endereço próprios. Não existe entidade "Loja"/"Unidade" separada de `Company`. O site **não pode** dizer "gerencie múltiplas lojas com um único cadastro" sem qualificar que hoje isso significa "múltiplos totens na mesma operação", não uma rede de filiais.

## 9. Usuários / permissões

- Papéis: `superadmin`, `admin` (equipe interna Ordin), `owner`, `manager`, `cashier` (empresa cliente). Autorização é role-based por rota, não RBAC granular por ação.
- Convite por e-mail com token, usuário fica "pending setup" até definir senha.
- MFA/TOTP com backup codes e dispositivos confiáveis — completo e testado.

## 10. Planos e cobrança do cliente final

- `PriceTable` — cobrança por totem, com desconto por volume (multiplicador para 2º e 3º-5º totens) + faixas de preço por transação.
- `CompanyPlan`/histórico — vínculo empresa↔tabela vigente, com auditoria de troca.
- **[ROADMAP]** — não existe campo de taxa de adesão/setup fee do lado do cliente final (só existe `setup_fee_per_totem` do lado do parceiro comercial, que é o que a Ordin paga, não cobra).

## 11. Programa de parceiros / comissão

- `Partner`/`CommissionTable` — comissão real = setup por totem + percentual recorrente mensal, com histórico append-only de troca de tabela e de vínculo empresa↔parceiro (permite reconstruir "qual comissão valia em qual mês").
- **[ROADMAP]** — não é um portal de afiliados self-service: o cadastro de parceiro é feito internamente por superadmin/admin. Não existe tela/API do próprio parceiro logando para ver sua comissão. Se o site menciona "programa de indicação", precisa deixar claro que hoje é um processo gerido pela Ordin.

## 12. Relatórios / dashboards

- Tela "Análises" (Recharts): KPIs de receita/ticket médio/volume com variação % vs. período anterior, gráfico de receita por período (hora/dia/semana/mês), quebra por terminal e por forma de pagamento, exportação CSV.
- **[EXPERIMENTAL]** — "produtos mais vendidos" **não é um relatório real**: o que existe é uma tag de texto livre digitada manualmente no cadastro do produto ("mais vendido" como rótulo), não um cálculo a partir de dados de venda. **Não anunciar como ranking/relatório de mais vendidos.**

## 13. Personalização visual

- `Company.visual_theme`/`visual_mode`/`catalog_menu_layout` — escolha entre **3 temas pré-definidos** (`ordin`, `mc`, `bk`) + modo claro/escuro + layout de menu horizontal/vertical.
- **[ROADMAP]** — não existe upload de logo nem seleção de cor customizada por empresa. A tela de boas-vindas do totem foi desenhada de propósito **sem** nenhum logo (nem da Ordin, nem do cliente). **Não anunciar "personalize com sua marca/logo"** — hoje é "escolha entre temas visuais prontos".

## 14. Contrato / onboarding

- Fluxo de contrato com status `pendente → enviado → assinado`, upload de PDF assinado para S3/MinIO com URL assinada temporária.
- **Consulta automática de CNPJ real**, com fallback em cascata de 3 provedores públicos (BrasilAPI → ReceitaWS → cnpj.ws), bloqueio de cadastro se situação cadastral inválida ou CNPJ duplicado. Wizard de 5 passos no admin.
- **[EXPERIMENTAL]** — suporte a CNPJ alfanumérico (formato novo da Receita) usa heurística de fallback, porque nenhum dos 3 provedores confirma suporte oficial ainda.

## 15. Totem (frontend real)

⚠️ **Cuidado editorial**: existem arquivos `frontend/totem-v3.tsx`/`totem.tsx` na raiz que são **protótipos para Claude Artifacts**, não o produto — não usar como referência de screenshot/demo real. O app de verdade é `frontend/totem/` (Vite + React + TypeScript, buildado via Docker, com testes E2E Playwright).

- Fluxo real: PIN → pareamento de terminal → boas-vindas → catálogo → tipo de consumo → CPF opcional → nome de retirada → pagamento (cartão/PIX) → ticket(s) com QR, incluindo **impressão térmica ESC/POS via QZ Tray**.
- **Modo espera com vídeo em rotação por empresa** — implementado de verdade (ORD-115), com fallback silencioso se não houver vídeo. Nota: `docs/totem-video-modo-espera-prompt.md` está desatualizado (diz "ainda não implementada").
- **Timeout de inatividade** com modal de aviso e contagem regressiva configurável por empresa — implementado (ORD-158).
- **[ROADMAP]** — capacidade offline **não existe**: nenhum service worker, fila local ou `IndexedDB` encontrado. O totem depende de conexão contínua. Não pode ser anunciado como "funciona offline".
- **[EXPERIMENTAL]** — o próprio código marca um experimento de UI paralelo (shadcn/React Aria) coexistindo com os componentes originais — não é a experiência única/definitiva ainda.

## 16. App de balcão (operador)

⚠️ Mesmo cuidado: `frontend/balcao-app.tsx` (raiz) é protótipo/stub, e existe um `package.json` Expo/React Native órfão na raiz de `frontend/` **sem nenhum código-fonte correspondente** — nunca foi desenvolvido. O app real é `frontend/balcao/`.

- **É um app web** (Vite + React, roda no navegador via HTTPS), não um app nativo instalável — **não pode ser anunciado como "app para Android/iOS" ou "baixe na loja de aplicativos"**.
- Login por PIN com MFA/TOTP, scan de QR via câmera do navegador (`getUserMedia` + `jsQR`, com fallback de digitação manual), feedback sonoro via Web Audio API, timeout de inatividade de 15 min.
- **[ROADMAP]** — feedback háptico/vibração não existe no app real (só mencionado no stub descartado).

## 17. Infraestrutura real vs. roadmap

**Confirmado pelo próprio `docs/ARQUITETURA.md`, seção 9, primeira linha**: *"Estado alvo, não implementado. Nada nesta seção existe hoje — sem conta AWS provisionada, sem Kong, sem Aurora, sem Datadog."*

- **Real e em uso hoje**: ambiente local via `docker-compose.yml` (MySQL, Redis, MinIO, RabbitMQ, MongoDB, 5 microsserviços, 4 frontends), CI básico (lint/teste/build) no GitHub Actions. Exposição para teste com dispositivo real via **ngrok** (ferramenta de dev/QA, não produção).
- **[ROADMAP], explicitamente não implementado**: toda a arquitetura AWS de produção (ECS Fargate, Aurora Serverless, Kong, ALB/WAF, ElastiCache, SQS/SNS, Datadog). Só existe um módulo Terraform parcial (`ecs/task_definitions.tf`) e a definição de onde os secrets ficariam (`secrets/`) — nada disso está implantado em conta AWS alguma.
- **O site não pode vender "infraestrutura enterprise AWS" ou "alta disponibilidade em nuvem"** como estado atual — isso é visão de arquitetura-alvo, bloqueada até decisão explícita do produto.

## 18. Filas assíncronas

- RabbitMQ — implementação real (`aio_pika`), funcional.
- **[MOCK]** — SQS é um **stub que só loga**, sem chamada real à AWS. Está "plugado" via factory, mas não fala com a AWS de verdade.
- Eventos de pagamento são publicados de verdade, mas sem nenhum consumidor no repositório hoje — é infraestrutura de auditoria/futuro, não o mecanismo real de sincronização (que é HTTP direto).

---

## O que NÃO prometer no site (resumo de guardrails)

| Não dizer | Por quê |
|---|---|
| "Funciona offline" | Sem capacidade offline no totem — código confirma ausência total |
| "App nativo para Android/iOS" (balcão) | É web app, não há build nativo funcional |
| "Painel de cozinha / KDS" | Não existe nenhuma estrutura para isso |
| "Personalize com sua marca/logo" | Só 3 temas pré-definidos, sem upload de logo |
| "Gerencie múltiplas lojas" (sem qualificar) | Multi-loja hoje = multi-terminal dentro do mesmo CNPJ/endereço |
| "Infraestrutura enterprise AWS" | Arquitetura-alvo documentada, não implantada |
| "Relatório de produtos mais vendidos" | É uma tag manual, não cálculo real de vendas |
| "Motor de recomendação inteligente" | Backend só expõe dados; decisão de exibição é do frontend |
| "Informação nutricional completa" | Só existe o campo calorias |
| "Já integrado com Adyen/Stone" (tempo presente) | Decisão tomada e arquitetura validada, mas zero código — usar "chegando"/"em integração", nunca "já funciona" |
| "Funciona com qualquer maquininha do mercado" | PagBank (~17% do mercado por volume) e InfinitePay não cabem no padrão de API em nuvem que PayGo/MP/Stone/Adyen compartilham — ver `02-concorrencia-matriz.md` |
| "Programa de afiliados self-service" | Cadastro de parceiro é 100% interno, gerido pela Ordin |

## O que É seguro afirmar com confiança

- Pagamento multi-provedor real (PayGo homologável + Mercado Pago com cartão/PIX/reembolso validados ao vivo), sem lock-in de adquirente — **diferencial raro no mercado pesquisado** (ver Fase 2).
- Emissão fiscal de NFC-e real por pedido via Focus NFe, com reconciliação e cancelamento automáticos.
- Estorno automático de pagamento quando a baixa de estoque falha — sem intervenção humana.
- QR assinado com HMAC-SHA256, proteção contra dupla coleta via lock de banco.
- Cardápio com grupos de opção (min/max), combos, promoções por período com detecção de conflito, alérgenos (RDC 727/2022), estoque com bloqueio automático de esgotado.
- Multi-terminal por empresa com isolamento de dados testado.
- Dashboard de receita/ticket médio/volume com comparação de período, por terminal e por forma de pagamento, exportável.
- Consulta automática de CNPJ com tripla redundância de provedor no onboarding.
