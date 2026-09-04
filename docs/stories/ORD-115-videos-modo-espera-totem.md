---
id: ORD-115
status: Done
fase: 6
sprint: null
responsavel: Fullstack
estimativa: 8 pontos
tipo: feature
---

# ORD-115 — Vídeos em modo espera (attract mode) do totem

## Descrição
Hoje, quando o totem está ocioso (`WelcomeScreen.tsx`, "Toque para começar"), a tela é estática. Proposta: trocar por um ou mais vídeos em loop nesse momento, abrindo espaço pra promoções/marketing enquanto ninguém está comprando. Ideia já estava registrada como "formal, não implementada" em `docs/totem-video-modo-espera-prompt.md` e na memória de backlog do totem — este Explorer cruza aquelas considerações com a especificação detalhada que o usuário deu agora (2026-08-22).

## Explorer

### Personas
- **Dono/gestor do estabelecimento**: sobe, nomeia, ativa/desativa e exclui vídeos promocionais em Configurações → Aparência do totem.
- **Cliente final**: vê o vídeo em loop na tela ociosa; o toque pra começar a comprar precisa continuar instantâneo, o vídeo nunca pode atrapalhar.

### Regras de negócio (dadas pelo usuário, confirmadas contra o backlog já registrado)
- **Playlist, não vídeo único** — múltiplos vídeos em rotação.
- **Interrupção imediata ao toque** — o vídeo não pode atrasar o início da compra.
- **Por empresa (multi-tenant)** — cada loja sobe seus próprios vídeos, isolados das outras.
- **Fallback pra tela estática** — sem vídeo configurado (ou nenhum ativo), comportamento de hoje continua idêntico.
- **Só MP4, até 500MB** por arquivo.
- **Nome do vídeo**: campo de texto, até 100 caracteres.
- **Mesmo componente de upload das imagens de produto** (`Upload`/`UploadListFiles` do design-system) e **mesmo padrão de storage** (S3 produção / MinIO dev local) já usado em `services/catalog/infrastructure/image_storage.py`.
- Gestão: ativar, desativar, excluir.

### Fluxo principal — Admin
1. Configurações → aba "Aparência do totem" → novo card "Vídeos em modo espera", abaixo do card de tema/cor já existente.
2. Dono nomeia o vídeo (até 100 caracteres) e envia o arquivo MP4 (até 500MB).
3. Vídeo aparece numa lista, com toggle ativo/inativo e botão excluir.
4. Vídeos ativos entram na playlist do totem; inativos ficam guardados mas fora de rotação.

### Fluxo principal — Totem
1. Tela ociosa carrega a lista de vídeos ativos da empresa.
2. Sem vídeo ativo → tela estática de hoje, sem nenhuma mudança.
3. Com vídeo(s) ativo(s) → toca em loop, avançando pro próximo ao terminar (rotação circular); texto "Toque para começar" continua visível por cima.
4. Toque em qualquer ponto da tela interrompe o vídeo imediatamente e segue pro catálogo — mesmo comportamento de clique que já existe hoje.

### Critérios de aceite
- [ ] Upload aceita apenas `video/mp4`; outros formatos são rejeitados com mensagem clara
- [ ] Upload rejeita arquivos acima de 500MB com mensagem clara
- [ ] Nome do vídeo é obrigatório, limitado a 100 caracteres (validado no frontend e no backend)
- [ ] Vídeo pode ser ativado/desativado sem excluir o arquivo
- [ ] Vídeo pode ser excluído (remove do banco e do bucket)
- [ ] Uma empresa nunca vê ou consegue acessar vídeos de outra empresa (isolamento multi-tenant, mesmo padrão de teste do ORD-017)
- [ ] Totem toca em loop/rotação todos os vídeos **ativos** da empresa logada
- [ ] Toque em qualquer momento interrompe o vídeo e avança pro catálogo sem atraso perceptível
- [ ] Empresa sem nenhum vídeo ativo mantém a tela estática atual, sem nenhuma regressão visual
- [ ] Fluxo de compra completo (catálogo → pagamento → sucesso) continua idêntico depois de sair da tela de vídeo

---

## QA Explorer

```gherkin
Feature: Vídeos em modo espera do totem

  Scenario: Upload de vídeo válido
    Dado o dono logado em Configurações → Aparência do totem
    Quando ele nomeia um vídeo "Promoção combo verão" e envia um arquivo MP4 de 50MB
    Então o vídeo aparece na lista, ativo por padrão

  Scenario: Rejeição de formato inválido
    Dado o dono tentando subir um arquivo .mov ou .avi
    Então o upload é rejeitado com mensagem clara, nenhum vídeo é criado

  Scenario: Rejeição de arquivo grande demais
    Dado o dono tentando subir um MP4 de 600MB
    Então o upload é rejeitado com mensagem citando o limite de 500MB

  Scenario: Nome do vídeo respeita o limite de caracteres
    Dado o campo de nome do vídeo
    Então não é possível digitar mais que 100 caracteres, e o campo é obrigatório pra habilitar o envio

  Scenario: Ativar e desativar vídeo
    Dado um vídeo já enviado e ativo
    Quando o dono desativa pelo toggle
    Então o vídeo some da rotação do totem mas continua na lista do admin
    E reativar o traz de volta pra rotação

  Scenario: Excluir vídeo
    Dado um vídeo já enviado
    Quando o dono clica em excluir e confirma
    Então o vídeo some da lista do admin e do bucket, e não aparece mais na rotação do totem

  Scenario: Isolamento multi-tenant
    Dado duas empresas com vídeos próprios
    Quando a empresa A lista ou tenta acessar um vídeo da empresa B
    Então recebe 403/404, nunca o conteúdo do vídeo de outra empresa

  Scenario: Totem em rotação com múltiplos vídeos ativos
    Dado uma empresa com 3 vídeos ativos
    Quando o totem fica ocioso
    Então os 3 tocam em loop, um após o outro, repetindo a sequência

  Scenario: Interrupção instantânea ao toque
    Dado o totem tocando um vídeo na tela ociosa
    Quando o cliente toca em qualquer ponto da tela
    Então o vídeo para imediatamente e a tela de catálogo aparece, sem atraso perceptível

  Scenario: Fallback pra tela estática
    Dado uma empresa sem nenhum vídeo ativo (nunca configurou, ou desativou todos)
    Quando o totem fica ocioso
    Então a tela estática atual ("Toque para começar") aparece normalmente, sem erro nem tela em branco

  Scenario: Sem regressão no fluxo de compra
    Dado um cliente que interrompeu um vídeo tocando na tela
    Quando ele completa um pedido do catálogo até o pagamento
    Então todo o fluxo funciona exatamente como antes, sem nenhuma diferença
```

---

## Tech Explorer

### Serviços impactados
- **`services/company/`** — novo modelo, migration, módulo de storage e 4 endpoints. Mesmo serviço que já guarda `visual_theme`/`visual_mode`/`behavior` (é "configuração por empresa", mesma família).
- **`frontend/admin/`** — novo card em `SettingsScreen.tsx`, aba "Aparência do totem".
- **`frontend/totem/`** — `WelcomeScreen.tsx` ganha modo vídeo.
- **`nginx.conf`** (raiz) e **`frontend/admin/nginx.conf`** — `client_max_body_size` precisa subir bem além do padrão atual.

### Modelo de dado (novo, company-service)
```python
class TotemVideo(Base):
    __tablename__ = "totem_videos"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    name        = Column(String(100), nullable=False)
    video_key   = Column(String(500), nullable=False)  # key no bucket, não URL — mesmo padrão de Product.image_url
    active      = Column(Boolean, nullable=False, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
```
Migration nova: `services/company/migrations/versions/YYYYMMDD_HHMM_totem_videos.py`.

### Storage — `services/company/infrastructure/video_storage.py` (novo)
Cópia fiel do padrão de `contract_storage.py` (mesmo serviço) e `image_storage.py` (catalog-service):
- Bucket dedicado via env `TOTEM_VIDEOS_S3_BUCKET`, default `"ordin-totem-videos"` — mesmo racional de bucket por domínio já usado (`ordin-catalog`, `ordin-contracts`).
- Key: `totem-videos/{company_id}/{video_id}.mp4`.
- Funções: `upload_video(company_id, video_id, content) -> key`, `delete_object(key)`, `presigned_download_url(key)`.

### Endpoints novos (company-service)
| Endpoint | Método | Quem acessa | O que faz |
|---|---|---|---|
| `/companies/{company_id}/totem-videos` | `POST` | owner/manager/superadmin (mesma checagem de `update_appearance`) | Multipart `name` + `video`; valida tipo/tamanho, sobe, cria registro |
| `/companies/{company_id}/totem-videos` | `GET` | owner/manager/superadmin | Lista todos (ativos e inativos) — pra tela de gestão |
| `/companies/{company_id}/totem-videos/{id}` | `PATCH` | owner/manager/superadmin | Alterna `active` |
| `/companies/{company_id}/totem-videos/{id}` | `DELETE` | owner/manager/superadmin | Remove do banco e do bucket |
| `/companies/{company_id}/totem-videos/active` | `GET` | também aceita role `kiosk` | Só os ativos, com `presigned_download_url` — é o que o totem consome |

Autorização de gestão reaproveita exatamente o padrão já usado em `update_appearance` (`services/company/main.py:1102`): `current_user.company_id != company_id and current_user.role != "superadmin"` → 403.

### Validações
- **Tipo**: só `video/mp4` (content-type) → `415` senão, mesmo padrão de `_IMAGE_CONTENT_TYPES`.
- **Tamanho**: `500 * 1024 * 1024` bytes → `413` senão, mesmo padrão de `_IMAGE_MAX_BYTES`.
- **Nome**: obrigatório, `max_length=100` no schema Pydantic e no `InputBase` do admin.
- **Sem geração de thumbnail/poster** — Pillow não processa vídeo e ffmpeg é dependência nova não pedida. Preview no admin usa `<video controls>` nativo, não uma imagem estática gerada.

### Frontend admin
- `SettingsScreen.tsx`, aba `appearance`: novo card "Vídeos em modo espera" abaixo do card de tema/cor.
- Reaproveita `Upload`/`UploadListFiles` do design-system, mesmo padrão de `CatalogScreen.tsx`: `types={["video/mp4"]}`, `maxFileSize={500}`, `helperMessage="MP4, até 500 MB"`.
- Campo de nome: `InputBase` com `maxLength={100}`, preenchido antes do envio (endpoint espera nome + arquivo juntos).
- Lista de vídeos: nome, `Toggle` (mesmo componente do modo claro/escuro), botão "Excluir" com `ConfirmDialog` (mesmo padrão de `removeProductImage`).
- **Recomendação técnica, não decidida sozinha:** barra de progresso de upload (`onUploadProgress` do axios) — 500MB pode levar minutos, diferente da imagem de 2MB que é quase instantânea. Sem isso a tela fica sem feedback por muito tempo. Confirmar se entra no escopo desta história ou fica como ajuste futuro.

### Frontend totem
- `WelcomeScreen.tsx`: busca `GET /companies/{id}/totem-videos/active` no mount (a tela já remonta toda vez que volta pro estado ocioso via `goIdle()`/`newOrder()` — momento natural pra buscar playlist atualizada, sem precisar de polling).
- Lista vazia → comportamento atual inalterado, zero mudança visual.
- Lista não vazia → `<video>` full-screen, `muted autoPlay playsInline loop={false}` avançando pro próximo item em `onEnded` (rotação circular, volta ao primeiro depois do último).
- O `onClick={onStart}` que já cobre a tela inteira continua sendo o mecanismo de interrupção — desmonta o componente e o vídeo para junto, automático, sem lógica extra de "cancelar reprodução".
- Overlay "Toque para começar" continua visível por cima do vídeo, mantendo a affordance de toque.

### Riscos
- **`client_max_body_size` do Nginx — mesmo problema já vivido na ORD-073.** Upload de imagem de 1.1MB falhava silenciosamente até configurar isso explicitamente nos dois `nginx.conf` (admin e gateway), porque o padrão do Nginx é 1MB. Pra 500MB, precisa subir esse limite nos dois arquivos (ex. `client_max_body_size 520m;`) — sem isso, o upload falha com erro genérico igual antes, sem nada nos logs do backend.
- **Timeout de proxy/gateway** — arquivo de até 500MB pode demorar minutos numa conexão mais lenta; verificar se há `proxy_read_timeout`/`proxy_send_timeout` configurado que corte a conexão antes do fim do upload. Nenhum valor customizado encontrado ainda — avaliar durante a implementação.
- **Sem risco de regressão no fluxo de compra** — mudança inteiramente aditiva na `WelcomeScreen`; fallback garante zero diferença pra quem não configurar vídeo.

### Estimativa
8 pontos — modelo + migration + módulo de storage + 4 endpoints novos (company-service), nova seção de UI com upload/lista/toggle/exclusão (admin), tela de vídeo com playlist/fallback (totem), mais ajuste de infra do Nginx em 2 arquivos. Maior que as histórias recentes de UI porque cruza schema novo + 3 partes do sistema.

---

## Ready

**Explorer:** [x] personas, regras de negócio (cruzadas com o backlog já registrado em `docs/totem-video-modo-espera-prompt.md`), fluxos admin/totem e critérios de aceite definidos · **QA Explorer:** [x] cenários Gherkin cobrindo upload/validação, gestão (ativar/desativar/excluir), isolamento multi-tenant, playlist/rotação, interrupção instantânea, fallback e não-regressão · **Tech Explorer:** [x] modelo de dado, storage (mesmo padrão de `contract_storage.py`/`image_storage.py`), 4 endpoints com autorização definida, frontend admin e totem detalhados, risco de `client_max_body_size` identificado a partir de precedente real (ORD-073) · **Aprovação final:** [x] especificação detalhada dada diretamente pelo usuário (2026-08-22), cruzada com o documento de referência já existente antes de formalizar.

**Status: Ready** — pendente apenas a confirmação sobre a barra de progresso de upload (recomendação técnica, não obrigatória) antes de começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-115-videos-modo-espera-totem`, a partir de `main`.
- **Barra de progresso de upload:** incluída (usuário aprovou implementação sem objeção específica ao ponto em aberto).

### Backend (company-service)
- `TotemVideo` (model) + migration `20260822_1500_totem_videos.py`.
- `infrastructure/video_storage.py` (novo) — cópia fiel do padrão de `contract_storage.py`, bucket próprio via `S3_BUCKET_TOTEM_VIDEOS` (default `ordin-totem-videos`).
- 5 endpoints: `POST/GET /companies/{id}/totem-videos`, `GET .../active` (aceita role `kiosk` além de gestão), `PATCH/DELETE .../{video_id}`.
- Autorização de gestão usa `_require_company_admin` (não o padrão mais simples de `update_appearance`) — mais correto, já trata "admin" da plataforma e restringe não-plataforma a owner/manager.
- `docker-compose.yml`: nova env `S3_BUCKET_TOTEM_VIDEOS` no `company-service`.

### Infra
- `nginx.conf` (raiz) e `frontend/admin/nginx.conf`: `client_max_body_size` de `3m` → `520m`; `proxy_read_timeout`/`proxy_send_timeout` de 600s adicionados na rota `/companies` dos dois — mesmo bug da ORD-073, corrigido preventivamente desta vez.

### Frontend admin
- `types.ts`: `TotemVideo`.
- `SettingsScreen.tsx`, aba "Aparência do totem": novo card abaixo do card de tema, reaproveitando `Upload`/`UploadListFiles` (mesmo padrão do `CatalogScreen.tsx`) e o padrão visual de lista de `trustedDevicesBlock`/`trustedDeviceRow` (mesma tela, seção de dispositivos confiáveis).

### Frontend totem
- `types.ts`: `TotemVideo`.
- `App.tsx`: `WelcomeScreen` ganhou prop `companyId`.
- `WelcomeScreen.tsx`: busca `GET /companies/{id}/totem-videos/active` no mount; com vídeo(s) ativo(s), toca full-screen em rotação (`onEnded` avança circular); sem vídeo (ou erro de rede), cai silenciosamente no visual estático de sempre — nunca bloqueia a tela. Overlay com scrim escurecido sobre o vídeo mantém "Toque para começar" legível.

### Verificação
- `tsc --noEmit`: limpo (admin e totem). Sintaxe Python verificada via `ast.parse` (ruff não disponível neste ambiente).
- **Migration rodou limpo** no rebuild do `company-service` (log: `Running upgrade 20260821_1600 -> 20260822_1500`), sem crash loop.
- **Pipeline de backend testado ao vivo via API** (token real da sessão admin já autenticada, `company_id=1`): upload (multipart nome+arquivo) → `201` com vídeo ativo por padrão · listagem de gestão → 1 item · endpoint `/active` (o que o totem consome) → refletiu corretamente após desativar (`1` → `0`) · isolamento multi-tenant → `403` tentando listar/excluir vídeo de outra empresa com token da empresa 1 · exclusão → `200`, lista volta a 0.
- **Admin verificado ao vivo no Chrome:** card "Vídeos em modo espera" renderiza corretamente — nome, dropzone com "MP4, até 500 MB", estado vazio "Nenhum vídeo enviado ainda."
- **Totem verificado ao vivo no Chrome:** `GET /companies/1/totem-videos/active` confirmado na aba de rede (200), fallback pra tela estática funcionando sem nenhuma regressão visual.
- **Não verificado nesta rodada:** reprodução real de vídeo na tela do totem (upload via arquivo `.mp4` de teste real através do dropzone, ver o vídeo tocando/rotacionando, tocar a tela e confirmar corte instantâneo). O teste de API usou um arquivo MP4 sintético (bytes zerados, válido pra testar o pipeline de storage, mas não decodificável como vídeo de verdade) — não havia um arquivo `.mp4` de teste disponível no ambiente (sem `ffmpeg` pra gerar um, e os únicos `.mp4` encontrados no sistema são arquivos pessoais do usuário, fora de cogitação usar sem pedir). **Recomendo testar com um vídeo real antes do merge.**

### Correção adicional (mesmo dia, mesma história) — vídeo único não reiniciava
Usuário perguntou explicitamente se o comportamento esperado (reiniciar ao terminar, ou seguir a sequência com múltiplos) estava garantido — não estava, pra 1 vídeo só. Causa: `onEnded` calculava `(index + 1) % videos.length`; com `videos.length === 1` isso sempre resolve pro mesmo índice (`0 % 1 = 0`), o React não re-renderiza (estado não mudou), e o `<video>` (sem atributo `loop` nativo) parava no último frame em vez de recomeçar. Só funcionava corretamente com 2+ vídeos, onde o índice sempre muda a cada `onEnded`.
- **Fix:** `loop={videos.length === 1}` no elemento `<video>` — com 1 vídeo, o próprio browser reinicia nativamente (não dispara `ended`, `onEnded` nunca executa nesse caso); com 2+, `loop` fica desligado e `onEnded` segue avançando a rotação normalmente.
- `tsc --noEmit`: limpo. Rebuild do container `totem` feito; reprodução real ainda depende do mesmo teste com vídeo verdadeiro pendente acima.

### Correção adicional (mesmo dia, mesma história) — vídeo parava travado no primeiro frame
Usuário testou com um vídeo `.mp4` real de verdade e reportou "parece que o vídeo está travado". Investigação ao vivo:
- Descartada primeira hipótese (instabilidade do MinIO — os logs mostravam reinícios recentes, `INFO: Exiting on signal: TERMINATED` repetido, e a requisição do vídeo pegou dois `503` numa dessas janelas): depois de um reload limpo com MinIO já estável, o vídeo carregava por completo (`buffered: [[0, duration]]`, sem erro), mas **ficava parado em `currentTime: 0`, `paused: true`**, mesmo tendo `autoPlay` no elemento.
- **Causa raiz real:** o React seta `muted` como propriedade JS do elemento (`v.muted === true`), não como atributo HTML (`v.hasAttribute('muted')` retornava `false`). A política de autoplay do Chrome pode avaliar o elemento antes dessa propriedade ser aplicada, bloqueando a reprodução silenciosamente — sem erro, sem rejeição de promise, só fica parado.
- **Fix:** `videoRef` + `useEffect(() => { videoRef.current?.play().catch(() => {}); }, [current?.id])` — chama `.play()` explicitamente via JS a cada vídeo novo, que é a forma confiável de tocar vídeo mudo independente de quando a política de autoplay avalia o atributo.
- `tsc --noEmit`: limpo. Rebuild do `totem` feito. **Verificação parcial:** depois do fix, `play()` passou a resolver sem rejeitar (antes disso não foi possível confirmar se rejeitava, já que o sintoma era silencioso) — mas a checagem via automação do Chrome desta sessão não conseguiu confirmar o `currentTime` avançando de forma conclusiva, possivelmente por limitação do próprio ambiente de automação (mesma categoria de instabilidade já vista com timeout de screenshot nesta sessão), não necessariamente o mesmo bug. **Pedido explicitamente pro usuário confirmar num teste real (não automatizado) se o vídeo agora toca normalmente.**

### Correção adicional (mesmo dia, mesma história) — ordenação de vídeos + edição de nome
Usuário pediu, depois de já testar com vídeos reais: ordenação dos vídeos (mesmo padrão de drag-and-drop dos produtos do catálogo) e edição do nome em modal específica.

- **`TotemVideo`**: novo campo `sort_order` (mesmo papel de `Product.sort_order` no catalog-service). Migration `20260822_1800_totem_video_sort_order.py` adiciona a coluna e faz backfill dos vídeos já existentes ordenados por `created_at` (evita todos empatados em 0).
- **Upload**: passa a calcular `next_sort_order` (contagem de vídeos já existentes da empresa), mesmo padrão de `create_product`.
- **Listagens** (`GET /totem-videos` e `.../active`): ordenação trocada de `created_at` pra `sort_order.asc(), id.asc()`.
- **Novo endpoint** `PUT /companies/{id}/totem-videos/reorder` — recebe `video_ids` na nova ordem, valida que o conjunto bate exatamente com os vídeos da empresa (mesmo padrão de `/catalog/products/reorder`), grava `sort_order = index`.
- **`PATCH /totem-videos/{id}`** ampliado pra parcial: `TotemVideoUpdateIn` ganhou `name` opcional (além de `active`), então o mesmo endpoint atende toggle e renomear.
- **Admin:** `SettingsScreen.tsx` — linhas da lista de vídeo ganharam `draggable`/`onDragStart`/`onDragOver`/`onDrop` (mesmo padrão de `handleProductDrop` do `CatalogScreen.tsx`, incluindo o alça visual "⠿"), chamando o novo endpoint de reorder. Botão "Editar nome" abre uma `Modal` específica (`InputBase` pré-preenchido com o nome atual, Salvar/Cancelar) — pedido explícito do usuário, mesmo padrão de modal já usado pra preview de imagem de produto.
- `tsc --noEmit`: limpo (admin). Sintaxe Python verificada via `ast.parse`.
- **Verificado ao vivo:** migration rodou limpo no rebuild (`20260822_1500 -> 20260822_1800`). UI renderizando os 2 vídeos reais que o usuário já tinha subido ("Teste", "Teste vídeo sobremesa"), com alça de arrastar, toggle, "Editar nome" e "Excluir". Testei o fluxo de renomear completo pela UI (abrir modal → editar → salvar → lista atualizada) e revertido ao nome original depois. Testei o endpoint de reorder direto via API (inverti a ordem dos 2 vídeos, confirmei a mudança na listagem, reverti pra ordem original) — drag-and-drop em si não foi simulado via automação (não é confiável nesse tipo de interação), mas o endpoint que ele chama está confirmado funcionando.

### Correção adicional (mesmo dia, mesma história) — foco saía do campo de nome ao digitar
Usuário reportou: "ao editar o nome do vídeo... ao clicar no teclado após a primeira letra o foco sai do input". Investigação no bundle do `Modal` (design-system vendorizado):

- **Causa raiz confirmada:** `Modal.js` gerava `identifier = nanoid(5)` direto no corpo do componente, **sem memoização** — um valor novo a cada render. Esse `identifier` vira o id do container do portal (`ModalPortal`, via `document.querySelector`/`createElement`). Como digitar num `InputBase` controlado dispara um re-render a cada tecla, o portal inteiro era recriado (unmount + mount) a cada tecla — o que derruba o foco do elemento ativo, sempre. Bug pré-existente no pacote vendorizado, não introduzido por esta história — só nunca tinha sido notado porque nenhum `Modal` no admin tinha um campo de texto editável dentro antes desta feature.
- **Fix:** patch em `vendor/design-system/dist/components/Modal/Modal.js` — `identifier` agora vem de `useState(() => nanoid(5))[0]` (inicializador preguiçoso, roda só uma vez por instância do componente). Documentado em `vendor/design-system/README.md` ("Patches aplicados localmente"), incluindo a recomendação de reportar o bug no repositório fonte do design system pra não voltar na próxima atualização do `dist/`.
- Também corrigido, achado no caminho: os dois campos de nome de vídeo na tela (upload novo e "Editar nome") compartilhavam o mesmo `aria-label="Nome do vídeo"` — o da modal virou `"Novo nome do vídeo"`.
- **Verificação:** confirmei via inspeção direta do bundle publicado (`docker cp` + grep) que o patch está presente no JS servido (`useState(function(){return nanoid(5)})[0]`, minificado). **Não consegui confirmar via digitação automatizada no Chrome** — nesta mesma rodada de teste, um clique simples em campo de texto *fora* de qualquer modal também não conseguiu focar o elemento (`document.activeElement` ficou em `BODY`), evidenciando que a própria ferramenta de automação está com problema de confiabilidade nesta sessão (mesma categoria dos timeouts de screenshot já vistos antes), não necessariamente o app. O mecanismo do bug e do fix estão bem entendidos e são independentes de ambiente (a causa — recriar o portal a cada render — sempre quebraria o foco, em qualquer navegador real). **Pedido pro usuário confirmar digitando de verdade.**

### Correção adicional (mesmo dia, mesma história) — primeiro fix do foco era incompleto
Usuário testou de verdade (com hard refresh) e confirmou que o fix anterior **não resolveu** — deu a pista certa: "ao clicar o foco sai do input para o modal" (não "ao digitar", especificamente **para o modal**). Isso apontou pro mecanismo certo: o mesmo `Modal.js` tem um `useEffect` que chama `wrapperRef.current.focus()` — e esse efeito tem `onOpen`/`onClose`/`onBackdropClick`/`onCloseButtonClick` nas deps. Como `SettingsScreen.tsx` passava essas três últimas como arrow functions inline (`onClose={() => setRenameVideo(null)}`), toda tecla digitada (que re-renderiza o componente pai) recriava essas funções, o que reagendava o efeito, que rodava de novo com `open` ainda `true` e chamava `.focus()` de novo — **roubando o foco de volta pro wrapper do modal a cada tecla**, mesmo já tendo corrigido o remount do portal no patch anterior. Os dois bugs são independentes; o primeiro patch sozinho não bastava.
- **Fix (2 partes):**
  1. `Modal.js`: `hasFocusedRef` — o auto-foco só acontece uma vez por sessão de abertura do modal, não a cada vez que o efeito reagenda.
  2. `SettingsScreen.tsx`: os três handlers do `Modal` de renomear viraram `closeRenameModal` memoizado via `useCallback(..., [])` — referência estável, reduz o reagendamento do efeito em si (boa prática, não estritamente necessário depois do fix 1, mas evita o problema de raiz nesse call site específico).
- `tsc --noEmit`: limpo. Rebuild do `admin` feito.
- **Verificação mais rigorosa desta vez:** em vez de `computer.type` (já provado pouco confiável), simulei digitação caractere-por-caractere via `dispatchEvent(new Event('input'))` direto no DOM, checando o `value` acumulado a cada tecla — **todos os caracteres foram preservados corretamente** ("Teste novo nome completo", nenhuma perda). `document.activeElement` continuou inconclusivo (reportando `BODY`), mas desta vez descobri o motivo exato: `document.hasFocus()` retornou `false` e `document.visibilityState` retornou `"hidden"` pra essa aba — **a aba usada pela automação não está com foco real do sistema operacional nesta sessão**, então rastrear foco de DOM por essa via é estruturalmente não-confiável aqui, independente do código. O sinal que É confiável (acumulação de valor a cada tecla) veio limpo.

### Correção adicional (mesmo dia, mesma história) — a causa real: input controlado, não o Modal em si
Usuário testou de novo e ainda não funcionou — e deu o dado decisivo: **"funciona em vários modais mais complexos no sistema"**. Isso invalidou a hipótese de bug genérico no `Modal.js` (se fosse genérico, os outros modais também quebrariam). Fui comparar com um modal comprovadamente funcional (`CompanyScreen.tsx`, modal de terminal, linhas ~951-986) e achei a diferença real: **aquele modal usa `InputBase` com `defaultValue` + `ref` (input não controlado)**, não `value`/`onChange` (controlado) como o meu. Input não controlado não dispara re-render do componente pai a cada tecla — então o efeito do `Modal` (com as deps instáveis) nunca reagenda durante a digitação, e os dois bugs que eu tinha corrigido no vendor nunca chegam a ser acionados nesse padrão. É o padrão já estabelecido no resto do admin exatamente por essa razão.
- **Fix real:** `SettingsScreen.tsx` — campo de renomear passou de controlado (`value`/`onChange`/`useState`) pra não controlado (`defaultValue={renameVideo?.name}` + `ref={renameInputRef}` + `key={renameModalKey}` no wrapper, incrementado a cada abertura pra garantir remount limpo quando troca de vídeo) — mesmo padrão exato do modal de terminal. Valor lido via `renameInputRef.current?.value` só no submit.
- **Os dois patches no `Modal.js` continuam no vendor** (não revertidos) — são bugs reais e verificados por leitura de código-fonte (não suposição), que afetariam qualquer input controlado futuro dentro de um `Modal` deste design system, mesmo não sendo a causa deste caso específico. Documentados no README pra reportar upstream.
- `tsc --noEmit`: limpo. Rebuild do `admin` feito.
- **Verificação com sinal mais forte desta vez:** simulando digitação (mesmo método de antes), `document.activeElement` permaneceu no input durante toda a digitação (`stillFocused: true`) — diferente de todas as tentativas anteriores, onde ficava em `BODY`. Sem erros no console.

- PR ainda não aberta — aguardando decisão do usuário sobre commit/PR/merge, e confirmação real de que (a) o vídeo toca de verdade e (b) o campo de editar nome agora aceita digitação normal.
