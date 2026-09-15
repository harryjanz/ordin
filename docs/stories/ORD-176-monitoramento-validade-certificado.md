---
id: ORD-176
status: Ready
estimativa: 6 pontos (4 backend + 2 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-176 — Monitoramento de validade do certificado digital

## Descrição
Nona história do épico — lacuna identificada pelo usuário depois da ORD-168 estar
implementada: certificado A1 tem validade de 1 ano (`docs/estudo-nfce.md` §1), e nenhuma das 8
histórias originais desenhava o que acontece quando ele vence. Sem isso, a emissão simplesmente
começa a falhar (mesmo tratamento genérico de "pendente" da ORD-171), sem ninguém saber a causa
raiz nem ter sido avisado com antecedência — grave pra um cliente com obrigação legal de emitir
nota.

**Correção feita na ORD-170 antes desta história**: achado ao vivo desta sessão — a resposta do
`POST /empresas` da Focus NFe já traz `certificado_valido_de`/`certificado_valido_ate` prontos
(extraídos do X.509 do lado deles). Adicionadas essas 2 colunas em `CompanyFiscalConfig` na
ORD-170 (ainda não implementada, seguro editar) — esta história consome esse dado já existente,
**não precisa parsear certificado localmente**.

## Persona
**Dupla**: time Ordin (superadmin/admin — precisa agir: reenviar cadastro depois do cliente
providenciar um certificado novo) **e** cliente final da empresa (owner — é o dono do CNPJ, é
ele quem precisa comprar/renovar o certificado junto ao contador ou uma certificadora, o Ordin
não tem como fazer isso por ele).

## Explorer

### História
Como **time Ordin e cliente responsável pela empresa**, quero ser avisado com antecedência
quando o certificado digital de uma empresa está perto de vencer, para providenciar a renovação
antes que a emissão de NFC-e pare de funcionar.

### Dois canais, personas diferentes (acesso à aba Fiscal é só do time Ordin, ORD-168)
- **Time Ordin**: vê a validade direto na aba Fiscal (já reserva espaço pra isso, campo
  `certificado_valido_ate` já capturado na ORD-170) + um indicador agregado na listagem de
  empresas (`CompanyListScreen`, tela que o superadmin já usa pra navegar entre empresas) —
  evita precisar abrir empresa por empresa pra descobrir quem está com certificado vencendo.
- **Cliente**: não acessa a aba Fiscal (decisão da ORD-168). Canal é **e-mail**, mesmo mecanismo
  já usado pra convite/reset de senha (`notification-service`, ORD-087) — endereçado ao contato
  técnico da empresa (`CompanyContact`, `contact_type="tecnico"`), com fallback pro e-mail do
  `owner` se não houver contato técnico cadastrado.

### Fluxo principal
1. Job diário (mesmo tipo de componente já necessário pro sync de NCM, ORD-169, e pro retry de
   notas pendentes, ORD-175 — agendamento é decisão de infra, não desenhado 3x) varre
   `CompanyFiscalConfig` de empresas com módulo fiscal `ativo=true` (ORD-171) e
   `certificado_valido_ate` preenchido.
2. Calcula dias restantes até o vencimento. Marcos de alerta: **30, 15, 7 e 1 dia(s)** antes.
3. Ao cruzar um marco (e só uma vez por marco — não reenviar todo dia), dispara e-mail pro
   contato técnico/owner da empresa e atualiza um registro interno de "último marco avisado"
   pra não duplicar.
4. Certificado já vencido: e-mail adicional avisando que a emissão vai parar (ou já parou, se o
   módulo tentou emitir depois do vencimento — mesmo tratamento "pendente" da ORD-171, agora com
   causa raiz identificável).
5. Aba Fiscal (time Ordin) mostra a validade com indicador visual: normal (>30 dias), atenção
   (≤30 dias), vencido — mesma paleta de cores já usada no status "completo/incompleto".
6. `CompanyListScreen` ganha uma coluna/indicador que sinaliza, sem precisar abrir a empresa,
   quais têm certificado vencendo/vencido.

### Fluxos alternativos / exceções
- **Empresa com módulo inativo**: job pula — não faz sentido avisar sobre certificado de uma
  empresa que não está emitindo nada.
- **Sem contato técnico cadastrado**: e-mail vai pro `owner` da empresa (fallback já documentado
  no ORD-087/company-service, mesmo padrão de outros fluxos transacionais).
- **`certificado_valido_ate` ainda não existe** (empresa cadastrada antes da correção na ORD-170,
  ou onboarding na Focus NFe ainda não rodou): job pula essa empresa, sem erro — simplesmente não
  há o que monitorar ainda.

### Dependências
- **company-service**: job diário novo, endpoint(s) de leitura pra `CompanyListScreen`, extensão
  do `GET /companies/{id}/fiscal-config` (ORD-168) com o indicador de validade.
- **notification-service**: endpoint novo `/internal/send-certificate-expiry-alert` (mesmo
  padrão específico-por-caso-de-uso já usado em `/internal/send-invite`/
  `/internal/send-password-reset` — não um endpoint genérico de e-mail).
- **frontend/admin**: `FiscalTab` (indicador de validade) + `CompanyListScreen` (coluna/badge
  agregado).
- **Histórias bloqueantes**: ORD-170 (Ready, ajustada pra capturar `certificado_valido_ate`).
- **Histórias que dependem desta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Job diário identifica empresas com módulo ativo cruzando os marcos de 30/15/7/1 dias
- [ ] E-mail disparado uma única vez por marco, sem duplicar
- [ ] E-mail vai pro contato técnico, com fallback pro owner
- [ ] Aba Fiscal mostra validade com indicador visual (normal/atenção/vencido)
- [ ] `CompanyListScreen` sinaliza empresas com certificado vencendo/vencido sem precisar abrir
      cada uma
- [ ] Empresa com módulo inativo ou sem `certificado_valido_ate` é ignorada pelo job, sem erro

### Wireframe / Mockup
**Faltando** — indicador na aba Fiscal é extensão pequena (mesma paleta já usada), coluna nova
em `CompanyListScreen` precisa de um mockup simples antes do Tech Explorer detalhar o layout
exato da tabela.

## QA Explorer

### Sobre isolamento multi-tenant nesta história
Nada novo — cada empresa só vê/recebe alerta do próprio certificado, mesmo padrão já aplicado
em toda a `CompanyFiscalConfig`.

### Cenários Gherkin

```gherkin
Feature: Monitoramento de validade do certificado digital
  Como time Ordin e cliente responsável pela empresa
  Quero ser avisado com antecedência quando o certificado está perto de vencer
  Para providenciar a renovação antes da emissão parar

  Background:
    Dado uma empresa "Burger House" com módulo fiscal ativo e certificado com validade conhecida

  # --- Happy path ---

  Scenario: Alerta disparado ao cruzar o marco de 30 dias
    Dado que o certificado vence em exatamente 30 dias
    Quando o job diário roda
    Então um e-mail é enviado pro contato técnico da empresa
    E o marco "30 dias" fica registrado como já avisado

  Scenario: Alerta não duplica no dia seguinte
    Dado que o alerta de 30 dias já foi enviado ontem
    Quando o job roda de novo hoje (ainda dentro da janela de 30 dias)
    Então nenhum e-mail novo é enviado pro mesmo marco

  # --- Bordas ---

  Scenario: Sem contato técnico cadastrado, cai no owner
    Dado uma empresa sem CompanyContact do tipo "tecnico"
    Quando um marco de alerta é cruzado
    Então o e-mail é enviado pro owner da empresa

  Scenario: Módulo fiscal inativo não gera alerta
    Dado uma empresa com certificado vencendo em 10 dias, mas módulo fiscal inativo
    Quando o job diário roda
    Então nenhum e-mail é enviado pra essa empresa

  Scenario: Certificado já vencido
    Dado um certificado vencido há 2 dias
    Quando o job diário roda
    Então um e-mail de "certificado vencido" é enviado
    E a aba Fiscal mostra o indicador "vencido"

  # --- Visibilidade pro time Ordin ---

  Scenario: Aba Fiscal mostra indicador de validade
    Dado uma empresa com certificado vencendo em 20 dias
    Quando o admin abre a aba Fiscal dessa empresa
    Então a validade aparece com indicador visual de "atenção" (≤30 dias)

  Scenario: Listagem de empresas sinaliza certificados vencendo
    Dado 3 empresas, uma com certificado vencendo em 10 dias e as outras normais
    Quando o admin abre a listagem de empresas
    Então só a empresa com certificado vencendo mostra o indicador de alerta
```

### Critérios de aceite testáveis
- [ ] Cada marco (30/15/7/1) dispara e-mail exatamente uma vez
- [ ] Fallback pro owner funciona quando não há contato técnico
- [ ] Módulo inativo ou sem `certificado_valido_ate` é ignorado, sem erro
- [ ] Indicador visual da aba Fiscal reflete corretamente normal/atenção/vencido
- [ ] Indicador da listagem de empresas aparece só nas empresas realmente afetadas

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante. Wireframe da coluna nova em `CompanyListScreen` é pendência de baixo risco,
registrada acima.

## Tech Explorer

### Serviços impactados
- **company-service**: job diário, controle de "último marco avisado", endpoint(s) de leitura.
- **notification-service**: endpoint novo de alerta de vencimento.
- **frontend/admin**: `FiscalTab`, `CompanyListScreen`.

### Modelo de dados (extensão de `CompanyFiscalConfig`, ORD-168/170)
```python
    # ORD-176 — controle de alerta já enviado, evita duplicar e-mail no mesmo marco.
    certificado_ultimo_alerta_dias = Column(Integer, nullable=True)  # 30, 15, 7, 1, ou 0 (vencido)
```
Não precisa de tabela de histórico separada — um único campo "qual foi o último marco avisado"
já resolve o "não duplicar", dado que os marcos são decrescentes e sequenciais (30→15→7→1→0).

### Job diário
```python
ALERT_THRESHOLDS = [30, 15, 7, 1]  # dias antes do vencimento

async def check_certificate_expirations() -> None:
    configs = await get_active_fiscal_configs_with_certificate()  # ativo=True, certificado_valido_ate preenchido
    for cfg in configs:
        dias_restantes = (cfg.certificado_valido_ate.date() - date.today()).days
        marco_atingido = next((t for t in ALERT_THRESHOLDS if dias_restantes <= t), 0 if dias_restantes < 0 else None)
        if marco_atingido is None:
            continue  # ainda longe do vencimento, nada a fazer
        if cfg.certificado_ultimo_alerta_dias is not None and cfg.certificado_ultimo_alerta_dias <= marco_atingido:
            continue  # já avisado nesse marco (ou marco mais apertado), não duplica
        destinatario = await get_technical_contact_or_owner_email(cfg.company_id)
        await send_certificate_expiry_alert(destinatario, dias_restantes)  # chamada ao notification-service
        cfg.certificado_ultimo_alerta_dias = marco_atingido
        await db.commit()
```

### Endpoint novo (notification-service)

#### `POST /internal/send-certificate-expiry-alert`
**Header:** `X-Internal-Secret` · mesmo padrão de `/internal/send-invite`

Payload: `{"to": "...", "company_name": "...", "dias_restantes": 15}` (ou negativo/0 pra já
vencido, template de e-mail ajusta a mensagem conforme o valor).

### Mudança no frontend
- `FiscalTab`: novo campo no resumo, "Validade do certificado" com `Tag` colorida (`success`
  >30 dias, `warning` ≤30 dias, `error` vencido) — mesma lógica de cor já usada no status
  completo/incompleto.
- `CompanyListScreen`: coluna ou ícone indicador nas linhas de empresas com certificado
  vencendo/vencido — exato layout fica pro wireframe pendente (QA Explorer), mas dado
  (`certificado_valido_ate` exposto num endpoint de listagem) já fica desenhado aqui.

### Migrations
Duas: (1) extensão da ORD-170 (`certificado_valido_de`/`certificado_valido_ate`, se ainda não
tiver sido migrada quando esta rodar — senão, squash numa migration só); (2) coluna nova
`certificado_ultimo_alerta_dias`.

### Eventos de fila
Nenhum — job periódico simples, mesmo modelo já decidido pra ORD-169/175.

### Impacto em outros serviços
notification-service ganha endpoint novo. Nenhum outro serviço afetado.

### Estimativa
- Backend: **~4 pontos** — job diário + lógica de marco/dedup + endpoint no
  notification-service + template de e-mail + endpoint(s) de leitura pra listagem.
- Frontend: **~2 pontos** — indicador na aba Fiscal (pequeno) + coluna na listagem de empresas
  (precisa de wireframe antes de fechar o design exato).
- **Total: ~6 pontos.**

### Riscos
1. **Wireframe da listagem de empresas não produzido** — mitigação: seguir com um indicador
   simples (badge/ícone) até haver definição visual mais elaborada, risco baixo dado que é só
   sinalização, não interação nova.
2. **Job diário é mais um componente de agendamento** (terceiro do épico, junto de ORD-169 e
   ORD-175) — reforça que vale definir o mecanismo de agendamento uma vez só, não reinventar em
   cada história — decisão de infra ainda em aberto, não bloqueia esta história especificamente.
3. **Certificado renovado não zera `certificado_ultimo_alerta_dias` automaticamente** — se o
   cliente providenciar um certificado novo, a ORD-170 (reenvio de cadastro) precisa resetar esse
   campo junto com o novo `certificado_valido_ate` — **dependência cruzada com a ORD-170,
   registrar no Tech Explorer dela quando for implementada** (upsert de certificado deveria
   limpar `certificado_ultimo_alerta_dias` sempre que `certificado_valido_ate` mudar).

### O que ainda impede o avanço pro Ready
Nada bloqueante. Risco 3 (reset do alerta em renovação) é um ponto de atenção pra implementação,
não motivo pra travar Ready.

## Ready

**Explorer:** [x] história Como/quero/para · [x] dois canais claros (time Ordin via aba +
listagem; cliente via e-mail) · [x] fluxo principal (6 passos) · [x] correção retroativa na
ORD-170 já aplicada (captura de `certificado_valido_ate`) · [x] dependências (bloqueada por
ORD-170) · [ ] wireframe da coluna em `CompanyListScreen` — não produzido, risco baixo · [x]
critérios de aceite funcionais.

**QA Explorer:** [x] happy path (alerta no marco de 30 dias) · [x] bordas (não duplica, sem
contato técnico, módulo inativo, certificado vencido) · [x] cenários de visibilidade pro time
Ordin (aba Fiscal + listagem) · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (3) · [x] modelo de dados (campo de controle de
alerta) · [x] job diário com lógica de marco/dedup detalhada · [x] endpoint novo no
notification-service · [x] migrations (duas) · [x] eventos de fila — nenhum · [x] estimativa (6
pontos) · [x] riscos com mitigação, incluindo dependência cruzada com a ORD-170 (reset do
alerta na renovação).

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 6 pontos · [x] sem bloqueios
não resolvidos · [ ] sprint específico — não atribuída ainda.

**Status: Ready.**
