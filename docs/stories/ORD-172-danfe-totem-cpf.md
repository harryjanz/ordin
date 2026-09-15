---
id: ORD-172
status: Ready
estimativa: 5 pontos (2 backend + 3 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-172 — DANFE-NFCe no totem + reativação condicional do CPF

## Descrição
Quinta história do épico — consome o resultado da emissão (ORD-171: `caminho_danfe`,
`qrcode_url`, status) pra efetivamente entregar o comprovante fiscal pro cliente, e reativa a
tela de CPF do totem (`CpfScreen.tsx`, hoje pronta mas sem navegação — comentário em `App.tsx`
linhas 401-404 já antecipava isso).

## Persona
**Cliente final no totem** — quem opcionalmente informa CPF e quem recebe o DANFE junto do
ticket.

## Contexto
Achado técnico desta história (checado no código real antes de escrever): `printService.ts` hoje
monta **ESC/POS binário puro** via bytes manuais (`buildEscPosBase64Compact`), enviado ao QZ Tray
como comandos de impressora, com fallback `window.print()` de um HTML **gerado localmente** (a
partir de SVGs próprios, não de uma página externa). O `caminho_danfe` que a Focus NFe devolve
(`docs/estudo-nfce.md` §7) é uma **URL de HTML pronta deles** — não dá pra converter isso em
ESC/POS via o pipeline existente. É um caminho de impressão genuinamente novo, não reaproveita o
builder de bytes atual.

## Explorer

### História
Como **cliente final no totem**, quero receber o DANFE-NFCe impresso junto do meu ticket quando
a nota foi emitida com sucesso, e poder informar meu CPF opcionalmente quando o módulo fiscal
está ativo, para ter o comprovante fiscal da minha compra sem precisar pedir nada a ninguém.

### Decisão técnica: impressão do DANFE via `window.open` + print, não ESC/POS
Dado que `caminho_danfe` é uma URL de HTML hospedada pela Focus NFe, a abordagem mais direta é
abrir essa URL numa janela/iframe oculto e disparar a impressão do navegador — o mesmo mecanismo
de fallback que já existe pro ticket (`window.open()` → `window.print()`), só que apontando pra
uma página externa em vez de HTML gerado localmente. **Risco real, não resolvido nesta
história**: não sabemos se o navegador/QZ Tray do totem consegue imprimir esse HTML **sem
diálogo** (silenciosamente, como o ticket ESC/POS já faz hoje) — isso depende de configuração do
navegador em modo quiosque (impressão silenciosa pra impressora padrão), não do código do Ordin
em si. Se não der pra fazer silencioso, a experiência muda (aparece diálogo de impressão), o que
é uma regressão de UX perceptível num fluxo hoje 100% silencioso.

### Fluxo principal
1. Pagamento aprovado, emissão fiscal tentada (ORD-171).
2. Totem recebe o resultado da emissão junto da resposta de conclusão do pedido (status
   "autorizada"/"pendente", e se autorizada, `caminho_danfe`+`qrcode_url`).
3. Se autorizada: imprime o ticket (ESC/POS, fluxo já existente) e, em seguida, abre
   `caminho_danfe` numa janela oculta e dispara a impressão dessa segunda página.
4. Se pendente/erro: imprime só o ticket, exatamente como hoje — nenhuma mudança perceptível pro
   cliente (mesmo modelo de resiliência do diagrama 03 do artifact C4).
5. **Reativação do CPF**: se a empresa tem o módulo fiscal `ativo` (ORD-171), a tela de CPF entra
   na navegação do totem (entre consumo/catálogo e pagamento, mesma posição já reservada em
   `App.tsx`). Se não, comportamento atual continua — CPF nunca aparece.
6. CPF informado (ou pulado) é enviado junto do pedido, usado só se quiser aparecer no destinatário
   da nota — informar CPF nunca é obrigatório (decisão já registrada, `docs/estudo-nfce.md` §8
   item 5).

### Achado que precisa tocar 4 lugares (mesmo padrão já visto no `CompanyInfo`)
Pra decidir se mostra a tela de CPF, o totem precisa saber se o módulo fiscal está `ativo` — esse
dado hoje não existe em nenhum payload que o totem recebe. Mesmo padrão já registrado como gotcha
de sessões anteriores (`CompanyInfo` tem cópias manuais em `validate-pin`/`verify-pin`/
`approve_device`/`approve_panel`): o flag `fiscal_module_ativo` precisa ser adicionado a **todos**
os pontos que hoje montam o payload de "info da empresa" pro totem, não só um. Levantar essa
lista exata fica pro Tech Explorer.

### Fluxos alternativos / exceções
- **Emissão pendente/erro**: só ticket, sem DANFE, sem nenhum aviso alarmante pro cliente (ele
  não sabe nem precisa saber que houve tentativa de nota fiscal).
- **Módulo fiscal inativo**: CPF nunca aparece, zero mudança de comportamento.
- **Cliente pula a tela de CPF**: segue pro pagamento normalmente, nota é emitida sem
  identificação do destinatário (comportamento padrão de mercado, já documentado).
- **Impressão do DANFE falha silenciosamente** (JS bloqueado, pop-up bloqueado pelo navegador):
  ticket já impresso continua válido pra retirada — DANFE que falhou vira parte do mesmo
  "pendente de reconciliação" da história 8, não trava nem repete a tentativa automaticamente.

### Dependências
- **frontend/totem**: `App.tsx` (navegação condicional pra tela "cpf"), `printService.ts`
  (caminho de impressão novo pro DANFE), `CpfScreen.tsx` (nenhuma mudança — já está pronto).
- **auth-service/company-service**: `fiscal_module_ativo` precisa ser exposto no payload de
  sessão do totem — pontos exatos a mapear no Tech Explorer.
- **Histórias bloqueantes**: ORD-171 (Ready).
- **Histórias que dependem desta**: nenhuma.

### Critérios de aceite funcionais
- [ ] Empresa com módulo inativo: CPF nunca aparece, nenhuma mudança de comportamento
- [ ] Empresa com módulo ativo: tela de CPF aparece na navegação, sempre skippable
- [ ] Nota autorizada: ticket + DANFE impressos
- [ ] Nota pendente/erro: só ticket impresso, sem erro visível pro cliente
- [ ] Falha na impressão do DANFE não afeta a validade do ticket já impresso

### Wireframe / Mockup
**Faltando** — `CpfScreen.tsx` já existe pronto (sem mudança visual necessária), a única UI nova
é indireta (a impressão em si). Risco baixo de UI, risco alto é técnico (impressão silenciosa,
já registrado acima).

## QA Explorer

### Sobre isolamento multi-tenant nesta história
Nada novo — CPF é dado do pedido do cliente final, não dado de empresa; `fiscal_module_ativo` já
vem escopado pela empresa da sessão do totem, mesmo padrão de qualquer outro dado de sessão.

### Cenários Gherkin

```gherkin
Feature: DANFE-NFCe no totem e reativação do CPF
  Como cliente final no totem
  Quero receber o DANFE quando a nota é emitida e poder informar CPF opcionalmente
  Para ter meu comprovante fiscal sem depender de ação manual

  # --- Happy path ---

  Scenario: Nota autorizada imprime ticket e DANFE
    Dado um pedido cuja emissão fiscal retornou "autorizada"
    Quando o totem conclui a impressão do pedido
    Então o ticket ESC/POS é impresso normalmente
    E o DANFE é aberto e impresso a partir do caminho_danfe retornado

  Scenario: Cliente informa CPF opcionalmente
    Dado uma empresa com módulo fiscal ativo
    Quando o cliente chega na tela de CPF
    E digita um CPF válido
    Então o CPF é enviado junto do pedido

  Scenario: Cliente pula a tela de CPF
    Dado uma empresa com módulo fiscal ativo
    Quando o cliente chega na tela de CPF
    E escolhe pular
    Então o pedido segue sem CPF, sem nenhum bloqueio

  # --- Bordas ---

  Scenario: Módulo fiscal inativo não mostra tela de CPF
    Dado uma empresa com módulo fiscal inativo
    Quando o cliente navega do catálogo pro pagamento
    Então a tela de CPF nunca aparece

  Scenario: Nota pendente imprime só o ticket
    Dado um pedido cuja emissão fiscal retornou "pendente"
    Quando o totem conclui a impressão do pedido
    Então só o ticket é impresso
    E nenhum erro ou aviso aparece pro cliente

  Scenario: Falha na impressão do DANFE não invalida o ticket
    Dado um pedido com nota autorizada
    Quando a impressão do DANFE falha (ex. pop-up bloqueado)
    Então o ticket já impresso continua válido pra retirada normal
```

### Critérios de aceite testáveis
- [ ] Módulo ativo/inativo controla corretamente a presença da tela de CPF
- [ ] CPF é sempre skippable, nunca bloqueia o fluxo
- [ ] Nota autorizada resulta em ticket + DANFE impressos
- [ ] Nota pendente/erro resulta em só ticket, sem aviso ao cliente
- [ ] Falha de impressão do DANFE não afeta o ticket

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante pros cenários de comportamento. Pendência explícita (não bloqueia Ready): mapear
exatamente quais endpoints hoje montam o payload de sessão do totem e precisam do campo
`fiscal_module_ativo` — fica pro Tech Explorer.

## Tech Explorer

### Serviços impactados
- **frontend/totem**: `App.tsx`, `printService.ts`.
- **auth-service e/ou company-service**: exposição de `fiscal_module_ativo` no payload de sessão
  do totem.

### Pontos que precisam do campo novo (mapeamento da pendência do QA Explorer)
Mesmo padrão do gotcha já registrado — `fiscal_module_ativo` (derivado de
`CompanyFiscalConfig.ativo`, ORD-171) precisa aparecer em:
1. `POST /auth/pin-login` → resposta que inclui dados da empresa pro totem.
2. Qualquer rota de refresh periódico de config da empresa que o totem já usa (ver gotcha
   registrado: "Totem: company só carregava no login", resolvido no ORD-158 com refresh a cada 2
   minutos — **este campo precisa entrar nesse refresh também**, já que ligar/desligar o módulo
   fiscal não deveria exigir logout/login do totem pra refletir).
3. Schema `CompanyInfo` (ou equivalente) no auth-service, que hoje já replica campos de `Company`
   pro totem — adicionar o campo lá segue o padrão existente.

### Endpoint/campo novo
`CompanyInfo` (auth-service) ganha `fiscal_module_ativo: bool`, buscado via chamada interna
existente ao company-service (mesmo caminho que já busca `consumption_mode_enabled` e outros
flags de config da empresa).

### Impressão do DANFE (`printService.ts`)
```typescript
async function printDanfe(caminhoDanfe: string): Promise<void> {
  const win = window.open(caminhoDanfe, "_blank", "width=1,height=1");
  if (!win) return; // pop-up bloqueado — falha silenciosa, não trava o fluxo (ver Riscos)
  win.onload = () => { win.print(); win.close(); };
}
```
Chamado depois da impressão do ticket normal, só quando `status === "autorizada"` e
`caminho_danfe` presente. **Não bloqueia nem espera confirmação** — dispara e segue.

### Navegação condicional (`App.tsx`)
```typescript
// linhas 401-404 hoje: comentário "tela pulada por ora" + screen === "cpf" nunca alcançado.
// Muda pra: só entra na navegação quando company?.fiscal_module_ativo === true.
const screensBeforePayment = company?.fiscal_module_ativo
  ? ["consumption", "cpf", "catalog"]
  : ["consumption", "catalog"];
```
(Pseudocódigo simplificado — implementação real segue a máquina de estados já existente no
arquivo, só adicionando a condição.)

### Migrations
Nenhuma nova — `fiscal_module_ativo` é campo derivado de dado já criado na ORD-171
(`CompanyFiscalConfig.ativo`), sem tabela nova.

### Eventos de fila
Nenhum.

### Impacto em outros serviços
auth-service passa a fazer (ou já faz, reaproveitado) uma chamada interna ao company-service pra
montar `CompanyInfo` — sem chamada nova se o mecanismo de agregação já existir; só campo
adicional no payload.

### Estimativa
- Backend: **~2 pontos** — campo novo propagado nos 2-3 pontos mapeados acima (auth-service +
  chamada interna), sem schema de banco novo.
- Frontend: **~3 pontos** — navegação condicional + caminho de impressão novo (não reaproveita o
  builder ESC/POS existente) + teste manual em hardware real de impressão (não só código).
- **Total: ~5 pontos.**

### Riscos
1. **Impressão silenciosa do DANFE não garantida** (registrado no Explorer) — é o maior risco
   técnico desta história. Mitigação: testar cedo em hardware real do totem (navegador em modo
   quiosque configurado), não assumir que vai funcionar só pelo código. Se não der pra fazer
   silencioso, decisão de produto (mostrar diálogo é aceitável, ou vale investir em alternativa
   como imprimir uma imagem renderizada do DANFE via QZ Tray) fica pra ser revisitada depois do
   teste, não resolvida agora.
2. **`fiscal_module_ativo` precisa tocar múltiplos pontos** (gotcha já conhecido) — mitigado por
   já ter o mapeamento explícito acima antes de começar a implementar, em vez de descobrir aos
   poucos.
3. **Pop-up bloqueado pelo navegador** — mitigado com falha silenciosa (não trava o fluxo), mas
   significa que o DANFE pode simplesmente não imprimir em alguns navegadores/configurações sem
   nenhum aviso — vale monitorar taxa de sucesso na prática, não só confiar que sempre funciona.

### O que ainda impede o avanço pro Ready
Nada bloqueante. Risco de impressão silenciosa é real, mas não é motivo pra travar Ready — é
motivo pra testar em hardware real cedo no downstream.

## Ready

**Explorer:** [x] história Como/quero/para · [x] decisão técnica de impressão do DANFE (via
window.open/print, não ESC/POS) com risco explícito registrado · [x] fluxo principal (6 passos) ·
[x] achado do padrão "toca múltiplos lugares" identificado · [x] dependências (bloqueada por
ORD-171) · [ ] wireframe — não produzido, risco baixo (UI já existe) · [x] critérios de aceite
funcionais.

**QA Explorer:** [x] happy path (ticket+DANFE, CPF informado/pulado) · [x] bordas (módulo
inativo, nota pendente, falha de impressão) · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados · [x] mapeamento dos pontos que precisam do campo
novo (auth-service, refresh periódico, CompanyInfo) · [x] implementação de impressão do DANFE
detalhada · [x] navegação condicional detalhada · [x] migrations — nenhuma · [x] eventos de fila
— nenhum · [x] estimativa (5 pontos) · [x] riscos com mitigação, incluindo o maior risco técnico
do épico até aqui (impressão silenciosa não garantida).

**Aprovação final:** [x] solução técnica revisada · [x] estimativa 5 pontos · [x] sem bloqueios
não resolvidos pro Ready (risco de impressão é pra downstream testar, não bloqueio de Ready) ·
[ ] sprint específico — não atribuída ainda.

**Status: Ready.** Recomendo, no downstream, testar a impressão do DANFE em hardware real do
totem **antes** de considerar a história pronta — é o único risco desta história que só se
resolve com teste físico, não com código ou revisão.
