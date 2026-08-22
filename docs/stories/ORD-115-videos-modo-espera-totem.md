---
id: ORD-115
status: Ready
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

- PR ainda não aberta — aguardando decisão do usuário sobre commit/PR/merge (e, idealmente, um teste com vídeo real primeiro).
