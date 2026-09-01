---
id: ORD-148
status: Ready
fase: null
sprint: null
responsavel: Backend SR + Frontend
estimativa: 5 pontos
---

# ORD-148 — Mercado Pago Point: garantir e monitorar modo de operação PDV

## Descrição
`GET /companies/{id}/mp-terminals` (ORD-133) já **lê** o `operating_mode` (PDV/STANDALONE/
UNDEFINED) de cada terminal Point vinculado à conta Mercado Pago da empresa, mas o Ordin nunca
**escreve** esse valor — o endpoint oficial pra isso (`PATCH /terminals/v1/setup`, "Alterar o
modo de operação") não é chamado em lugar nenhum do código. Isso significa que, se um terminal
cair pra `STANDALONE`/`UNDEFINED` (reset físico, reconfiguração manual, instabilidade, degradação
de serviço do MP), o Ordin não detecta e não corrige — a integração simplesmente para de
funcionar silenciosamente até alguém descobrir manualmente no painel do Mercado Pago. Esta
história implementa a capacidade de garantir (e, idealmente, monitorar) o modo PDV do lado do
Ordin.

## Persona
**Admin/owner da empresa** — hoje sem visibilidade nem controle sobre o modo de operação real dos
terminais Point vinculados, e sem forma de corrigir um desvio a não ser entrando manualmente no
painel do Mercado Pago.

## Contexto

### Origem: recomendação oficial do próprio Mercado Pago, não um problema observado isoladamente
Rodando o `quality_checklist` oficial do Mercado Pago (via MCP) contra a aplicação real do Ordin
(app ORDIN), duas boas práticas aparecem como não atendidas: **"Switch device mode"** ("ofereça a
possibilidade de trocar o modo PDV/STANDALONE em seu desenvolvimento para facilitar os usuários
poderem efetuar a troca") e **"Device alerts"** ("permite receber notificações de reset do
dispositivo, desvincular e troca do modo de operação"). O custo de implementar é baixo — os
endpoints de leitura (`GET /terminals/v1/list`) e a tela que já lista os terminais (Empresa >
Terminais, ORD-133) já existem; falta só a escrita/correção e, opcionalmente, o monitoramento.

### Motivação real que levou à investigação
Operando o caixa com o terminal físico real de produção (Q92, Burger House), a order chega no
terminal mas às vezes só fica disponível pra pagamento depois que o operador aperta manualmente
o botão **"Atualizar"** na própria maquininha — o que atrapalha a operação. A investigação dessa
sessão (2026-09-01) cruzou a documentação oficial do Mercado Pago com dados reais de
`ordin_audit.payment_events` (Mongo): a doc do MP reconhece esse comportamento como algo tratado
no próprio terminal físico ("caso a order não seja carregada automaticamente no terminal,
pressione o botão Atualizar"), não como algo controlado pelo `operating_mode`; e nos dados reais,
3 de 10 sequências de cobrança via Point nunca saíram do status `created` (nunca chegaram a
`at_terminal`) dentro da janela de polling do Ordin — consistente com o comportamento descrito
pela doc.

**Importante: esta história não deve ser vendida como a correção garantida do botão "Atualizar".**
A causa mais provável desse sintoma específico é entrega/sincronização entre o servidor do
Mercado Pago e o hardware do terminal — fora do alcance do `operating_mode`. Esta história cobre
uma lacuna operacional real e distinta (detecção e correção de desvio de modo PDV), que vale a
pena por si só como boa prática oficial de baixo custo, com uma chance real — não garantida — de
também reduzir a frequência do problema relatado.

### Escopo para a Explorer detalhar
- Forma de o Ordin garantir/corrigir o `operating_mode` para PDV quando detectar desvio: ação
  manual pelo admin (ex.: botão "Corrigir modo" na tela Empresa > Terminais, que já lista os
  terminais desde o ORD-133) e/ou verificação automática periódica — decisão a amadurecer no
  Tech Explorer.
- Avaliar se vale assinar o tópico de webhook de alerta de dispositivo do Mercado Pago
  (reset/desvinculação/troca de modo) para notificação em tempo real, em vez de depender só de
  consulta sob demanda — decisão técnica, não resolvida aqui.

### Prioridade
Mais baixa que [[ORD-147]] (reembolso Mercado Pago, crítico para a operação) — o usuário optou
por avançar com ela mesmo assim, por ser recomendação oficial de baixo custo, mesmo sem garantia
de que resolve o sintoma do botão "Atualizar".

### Dependências e histórico relacionado
- [[ORD-133]] — já implementa a listagem de terminais e leitura do `operating_mode`, base para
  esta história
- `docs/analise-meios-pagamento-integracao.md` — documento que consolida este e outros gaps de
  integração com meios de pagamento, incluindo o achado do `quality_checklist` que originou esta
  história

---

## Explorer

## História
Como **admin/owner da empresa configurando terminais em Empresa > Terminais**, quero corrigir
manualmente o modo de operação de um terminal Point que não está em PDV, direto no Ordin, para
não depender de entrar no painel do Mercado Pago quando um terminal cair pra STANDALONE/UNDEFINED
(reset, reconfiguração manual, instabilidade).

## Contexto e motivação
O ORD-133 já lista os terminais Point da empresa e mostra o `operating_mode` de cada um, mas é
só leitura — hoje, se um terminal desviar do modo PDV, o único jeito de corrigir é entrando
manualmente no painel do Mercado Pago. Essa história fecha essa lacuna, seguindo recomendação
oficial do próprio Mercado Pago (`quality_checklist`, itens "Switch device mode" e "Device
alerts"). **Importante**: isso é uma melhoria de visibilidade/controle operacional, não a
correção comprovada do problema relatado de terminal exigindo o botão "Atualizar" — a
investigação desta mesma sessão concluiu que esse sintoma específico é mais provavelmente
entrega/sincronização entre o servidor do MP e o hardware, fora do alcance do `operating_mode`.
Vale a pena de qualquer forma, por ser boa prática de baixo custo (os endpoints de leitura já
existem) e por eliminar um ponto cego real: hoje o Ordin não tem nenhuma forma de saber ou agir
quando um terminal cai fora do modo PDV, a não ser o admin notar o pagamento parando de
funcionar e investigar manualmente.

## Fluxo principal
1. Admin abre Empresa > Terminais; a listagem de terminais MP (já existente, ORD-133) mostra o
   `operating_mode` de cada terminal
2. Terminal com `operating_mode !== "PDV"` (ou seja, `STANDALONE` ou `UNDEFINED`) exibe uma ação
   "Corrigir para PDV" ao lado — terminais já em PDV não mostram essa ação
3. Admin clica em "Corrigir para PDV"
4. Backend (company-service) chama `PATCH /terminals/v1/setup` no Mercado Pago com
   `{"terminals": [{"id": "<device_id>", "operating_mode": "PDV"}]}`, usando o `access_token` já
   configurado da empresa
5. Sucesso: toast/mensagem clara — **"Modo alterado para PDV. Reinicie o terminal físico pra
   completar a mudança."** — a doc oficial do MP exige reinício manual do hardware pra a troca
   ter efeito, então a UI precisa deixar isso explícito, não só "concluído"
6. Listagem atualiza o `operating_mode` exibido (mesmo que o valor real só reflita a mudança
   depois do reinício físico — a resposta do PATCH já confirma que o pedido foi aceito pelo MP)

## Fluxos alternativos / exceções
- Terminal já em modo PDV: ação não aparece, nada a corrigir
- Falha na chamada ao Mercado Pago (token inválido, terminal não encontrado, erro de rede): toast
  de erro específico, nenhuma alteração local, admin pode tentar de novo
- Empresa sem Mercado Pago configurado: tela already trata esse caso desde o ORD-133 (mensagem
  explicativa, sem quebrar o resto do formulário) — comportamento inalterado
- Admin sem permissão de escrita: ação não é exibida nem acessível via API direta (mesma
  restrição de role já usada nos demais endpoints de escrita de terminal)
- **Fora de escopo, não implementado nesta história**: nenhuma checagem automática/periódica —
  se o admin não abrir a tela, um terminal fora do modo PDV continua sem ser detectado até
  alguém notar manualmente. Isso é uma limitação conhecida e aceita da v1, não um bug.

## Dependências
- Serviços envolvidos: `company-service` (endpoint novo), `frontend/admin` (`CompanyScreen.tsx`)
- Histórias bloqueantes: nenhuma — [[ORD-133]] já está `Done`, esta história estende a
  listagem que ele já implementa

## Critérios de aceite funcionais
- [ ] Terminal MP com `operating_mode !== "PDV"` mostra a ação "Corrigir para PDV" em Empresa >
      Terminais
- [ ] Terminal já em PDV não mostra essa ação
- [ ] Ação chama `PATCH /terminals/v1/setup` no Mercado Pago com o `device_id` correto
- [ ] Sucesso mostra mensagem explícita instruindo o admin a reiniciar o terminal físico —
      nunca dá a entender que a correção já está 100% efetiva sem essa ação manual
- [ ] Falha na chamada ao MP mostra erro específico, sem alterar nada localmente
- [ ] Sem nenhum job em background, agendamento, ou polling automático — puramente sob demanda,
      quando o admin abre a tela
- [ ] Restrito à mesma role de escrita já usada nos demais endpoints de configuração de terminal

## Wireframe / Mockup
Sem mockup novo — reaproveita a listagem de terminais MP já existente na tela Empresa >
Terminais (ORD-133), só adicionando uma ação/botão condicional por linha quando o
`operating_mode` não for `PDV`.

---

## QA Explorer

```gherkin
Feature: Corrigir modo de operação PDV do terminal Mercado Pago
  Como admin/owner da empresa
  Quero corrigir manualmente o modo de operação de um terminal Point fora de PDV
  Para não depender do painel do Mercado Pago quando um terminal desviar do modo PDV

  Background:
    Dado que sou admin da empresa 1 (Burger House), autenticado com role "owner"
    E a empresa 1 tem Mercado Pago configurado e ativo

  # ── Happy path ────────────────────────────────────────────────────────────

  Scenario: Terminal fora do modo PDV mostra a ação de correção
    Dado que a consulta a GET /companies/1/mp-terminals retorna o terminal
      "PAX_Q92__Q92-1734060436" com operating_mode "STANDALONE"
    Quando abro Empresa > Terminais
    Então esse terminal exibe a ação "Corrigir para PDV"

  Scenario: Corrigir terminal para PDV com sucesso
    Dado o terminal "PAX_Q92__Q92-1734060436" com operating_mode "STANDALONE"
    Quando clico em "Corrigir para PDV"
    Então o backend chama PATCH /terminals/v1/setup no Mercado Pago com
      {"terminals": [{"id": "PAX_Q92__Q92-1734060436", "operating_mode": "PDV"}]}
    E a chamada retorna sucesso
    E vejo a mensagem "Modo alterado para PDV. Reinicie o terminal físico pra completar a mudança."
    E a mensagem não afirma em nenhum momento que a correção já está 100% concluída

  Scenario: Terminal já em PDV não mostra a ação
    Dado que a consulta a GET /companies/1/mp-terminals retorna um terminal com
      operating_mode "PDV"
    Quando abro Empresa > Terminais
    Então esse terminal não exibe a ação "Corrigir para PDV"

  # ── Bordas ────────────────────────────────────────────────────────────────

  Scenario: Terminal em UNDEFINED também mostra e permite a correção
    Dado que a consulta a GET /companies/1/mp-terminals retorna um terminal com
      operating_mode "UNDEFINED"
    Quando abro Empresa > Terminais
    Então esse terminal exibe a ação "Corrigir para PDV"
    E clicar nela dispara o mesmo PATCH /terminals/v1/setup com operating_mode "PDV"

  # ── Erros ─────────────────────────────────────────────────────────────────

  Scenario: Falha na chamada ao Mercado Pago não altera nada localmente
    Dado o terminal "PAX_Q92__Q92-1734060436" com operating_mode "STANDALONE"
    E o Mercado Pago retorna erro (token inválido, terminal não encontrado, ou falha de rede)
      ao chamar PATCH /terminals/v1/setup
    Quando clico em "Corrigir para PDV"
    Então vejo um toast de erro específico, não uma mensagem genérica
    E a listagem continua mostrando o terminal como "STANDALONE"
    E a ação "Corrigir para PDV" continua disponível pra nova tentativa

  Scenario: Empresa sem Mercado Pago configurado não quebra a tela
    Dado que a empresa 2 não tem nenhuma config ativa de Mercado Pago
    Quando o admin da empresa 2 abre Empresa > Terminais
    Então vê a mensagem explicativa já existente do ORD-133 ("Configure o Mercado Pago...")
    E nenhuma ação de correção de modo é exibida

  Scenario: Admin sem role de escrita não vê nem consegue acionar a correção
    Dado um usuário autenticado com role sem permissão de escrita (ex.: "cashier")
    Quando esse token chama diretamente o endpoint de correção de modo
    Então a resposta é 403
    E nenhuma chamada é feita ao Mercado Pago

  # ── Isolamento multi-tenant ──────────────────────────────────────────────

  Scenario: Admin de uma empresa não corrige terminal de outra empresa
    Dado um terminal MP pertencente à empresa 1 com operating_mode "STANDALONE"
    E um token de admin autenticado na empresa 2
    Quando esse token chama o endpoint de correção de modo para o terminal da empresa 1
    Então a resposta é 403 ou 404 (mesma semântica já usada em endpoints de terminal existentes)
    E nenhuma chamada é feita ao Mercado Pago
    E o terminal da empresa 1 permanece "STANDALONE"

  # ── Regressão / limite de escopo (v1 é só sob demanda) ──────────────────────

  Scenario: Nenhuma correção acontece sem ação explícita do admin
    Dado um terminal MP fora do modo PDV
    Quando o tempo passa sem que ninguém abra Empresa > Terminais nem clique em nada
    Então o terminal continua exatamente como está — nenhum job, cron ou verificação
      automática existe nesta história pra corrigir ou sequer notificar sozinho
```

**Cenários revisados e aprovados pelo PM.**

---

## Tech Explorer

### Serviços impactados
- **company-service**: endpoint novo (`main.py`)
- **frontend/admin**: `CompanyScreen.tsx` — busca de `operating_mode` sai do modal e passa a
  alimentar também a tabela principal de terminais

### Endpoints

#### PATCH /companies/{company_id}/mp-terminals/operating-mode
**Serviço:** company-service
**Auth:** JWT obrigatório | role: mesma exigida por `_require_company_admin` (owner/manager da
própria empresa, ou admin/superadmin de qualquer empresa)
**company_id:** da URL, validado contra o JWT dentro de `_require_company_admin` (mesma função
já usada por `list_mp_terminals` — resolve role e isolamento multi-tenant de uma vez, sem
lógica nova)

Request:
```json
{
  "device_id": "PAX_Q92__Q92-1734060436"
}
```

Response 200:
```json
{
  "ok": true
}
```

Erros: `403` (role insuficiente ou empresa errada, via `_require_company_admin`), `404` (empresa
não encontrada/inativa), `502` (Mercado Pago não configurado, token inválido, ou a chamada
`PATCH /terminals/v1/setup` falhou — mesma mensagem genérica de `list_mp_terminals`: "Não foi
possível [...]. Tente novamente ou configure manualmente.")

**Implementação** (`services/company/main.py`, logo após `list_mp_terminals`):
```python
class MpOperatingModeIn(BaseModel):
    device_id: str


@app.patch(
    "/companies/{company_id}/mp-terminals/operating-mode",
    tags=["Terminais"],
    summary="Corrigir terminal Point para modo PDV (ORD-148)",
)
async def fix_mp_operating_mode(
    company_id: int,
    body: MpOperatingModeIn,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    _require_company_admin(current_user, company_id)
    co = await db.get(Company, company_id)
    if not co or not co.active:
        raise HTTPException(404, "Empresa não encontrada")

    cfg_result = await db.execute(
        select(CompanyPaymentConfig).filter_by(company_id=company_id, provider="mercadopago", active=True)
    )
    cfg = cfg_result.scalars().first()
    if not cfg or not cfg.api_key:
        raise HTTPException(502, "Mercado Pago não configurado para esta empresa.")

    access_token = decrypt_field(cfg.api_key)
    mp_error = HTTPException(
        502, "Não foi possível alterar o modo do terminal no Mercado Pago. Tente novamente ou configure manualmente."
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                "https://api.mercadopago.com/terminals/v1/setup",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"terminals": [{"id": body.device_id, "operating_mode": "PDV"}]},
            )
    except httpx.HTTPError:
        raise mp_error
    if resp.status_code not in (200, 201):
        raise mp_error

    return {"ok": True}
```
Reaproveita 100% o padrão já validado em `list_mp_terminals` — mesma função de autorização,
mesma forma de buscar/descriptografar credencial, mesmo mapeamento de erro pra 502. Nenhuma
lógica nova de autenticação/multi-tenant a inventar.

### Frontend (`CompanyScreen.tsx`)

**Mudança 1 — buscar `operating_mode` pra tabela principal, não só pro modal.** Hoje
`fetchMpTerminals` só roda ao abrir o modal de criar/editar terminal, e descarta o campo
`operating_mode` (`.map((t) => ({ value: t.id, label: t.id }))`). Passa a rodar também ao
carregar a aba de Terminais, guardando um mapa auxiliar:
```tsx
const [mpOperatingModes, setMpOperatingModes] = useState<Record<string, string | null>>({});

async function loadMpOperatingModes() {
  if (!companyId) return;
  try {
    const r = await api.get(`/companies/${companyId}/mp-terminals`);
    if (!r.data.configured) return;
    const modes: Record<string, string | null> = {};
    for (const t of r.data.terminals as MpTerminal[]) modes[t.id] = t.operating_mode;
    setMpOperatingModes(modes);
  } catch {
    // Silencioso — não é crítico pra tabela carregar; o indicador de modo
    // simplesmente não aparece pra nenhum terminal, sem quebrar o resto.
  }
}
```
Chamado no mesmo `useEffect` que já carrega a lista de terminais quando `companyId` muda.

**Mudança 2 — coluna nova na tabela principal**, só renderiza quando `t.mp_device_id` está
preenchido e existe uma entrada correspondente em `mpOperatingModes`:
```tsx
{
  key: "mp_mode", header: "Modo PDV", render: (t) => {
    if (!t.mp_device_id) return <span className={styles.muted}>—</span>;
    const mode = mpOperatingModes[t.mp_device_id];
    if (mode === "PDV") return <Tag variant="success">PDV</Tag>;
    if (mode == null) return <span className={styles.muted}>—</span>; // ainda não carregado
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Tag variant="warning">{mode}</Tag>
        <Button size="small" variant="secondary" onClick={() => fixOperatingMode(t.mp_device_id!)}>
          Corrigir
        </Button>
      </div>
    );
  },
},
```
```tsx
async function fixOperatingMode(deviceId: string) {
  try {
    await api.patch(`/companies/${companyId}/mp-terminals/operating-mode`, { device_id: deviceId });
    makeToast("success", "Modo alterado para PDV. Reinicie o terminal físico pra completar a mudança.");
    loadMpOperatingModes(); // pode ainda mostrar o valor antigo até o reinício físico — esperado
  } catch (err) {
    makeToast("error", parseApiError(err).message);
  }
}
```
Decisão de UI a validar na implementação (não é a única forma possível): dá pra caber como
coluna nova na tabela existente sem quebrar o layout atual (5 colunas → 6), já que a tabela é
`variant="compact"`. Se ficar apertado, alternativa é mover pra dentro de uma linha expandida
por terminal — mas isso é detalhe de implementação, não decisão de arquitetura.

### Migrations
Nenhuma — não mexe em schema do Ordin, só chama a API externa do Mercado Pago.

### Eventos de fila
Não aplicável.

### Impacto em outros serviços
Nenhum — `payment-service` não precisa saber de `operating_mode`, é só configuração/visibilidade
no admin.

### Estimativa
- Backend: 2 pontos (endpoint novo, reaproveita 100% o padrão de auth/config de `list_mp_terminals`)
- Frontend: 3 pontos (mover a busca de `operating_mode` pra fora do modal, coluna nova na
  tabela, ação de correção, mensagem de reinício)
- **Total: 5 pontos**

### Riscos
- **Reinício manual do hardware é passo obrigatório fora do controle do sistema** — a mudança
  de modo só é efetiva de verdade depois do admin reiniciar o terminal físico. A UI só pode
  avisar (mensagem explícita), não pode confirmar nem forçar isso. Se o admin ignorar o aviso,
  o terminal continua no modo antigo e a tela pode voltar a mostrar o problema na próxima
  consulta — comportamento esperado, não bug, mas vale documentar isso claramente pro time de
  suporte também, não só na UI.
- **Latência de rede** — cada carregamento da aba de Terminais agora dispara uma consulta a
  mais ao Mercado Pago (mesma chamada que já existia, só que também roda fora do modal agora).
  Mitigado pela mesma UX de erro silencioso já usada: se falhar, a coluna de modo simplesmente
  não aparece, sem travar a tela.
- Sem conflito com `docs/ARQUITETURA.md` — `company_id` vem da URL validado contra o JWT via
  `_require_company_admin` (nunca do body), nenhuma credencial nova hardcoded, reaproveita
  criptografia/descriptografia já estabelecida pra `api_key`.

---

## Ready

### Checklist de entrada

**Explorer (PM + Produto)**
- [x] História no formato Como/Quero/Para
- [x] Contexto e motivação documentados (recomendação oficial do `quality_checklist` do MP,
      sem prometer resolver o sintoma do botão "Atualizar")
- [x] Fluxo principal passo a passo
- [x] Dependências identificadas ([[ORD-133]], `Done`)
- [x] Wireframe descrito (reaproveita listagem existente, sem mockup novo)
- [x] Critérios de aceite funcionais escritos

**QA Explorer (QA)**
- [x] Happy path em Gherkin (terminal fora de PDV mostra ação, correção com sucesso, terminal
      já em PDV não mostra ação)
- [x] Cenários de borda (terminal em UNDEFINED também corrigível)
- [x] Cenários de erro (falha na chamada ao MP não altera nada localmente, empresa sem MP
      configurado, role sem permissão)
- [x] Cenário de isolamento multi-tenant incluído
- [x] Cenário de limite de escopo (nenhuma correção automática, só sob demanda)
- [x] Cenários aprovados pelo PM

**Tech Explorer (Backend + Frontend)**
- [x] Serviços impactados documentados (company-service, frontend/admin)
- [x] Endpoint novo com payload request/response/erros (`PATCH /companies/{company_id}/mp-terminals/operating-mode`)
- [x] Migrations descritas (nenhuma, com justificativa)
- [x] Eventos de fila (nenhum aplicável)
- [x] Estimativa de esforço definida (5 pontos: 2 backend + 3 frontend)
- [x] Riscos identificados com mitigação (reinício manual do hardware fora do controle do
      sistema, latência de rede adicional)
- [x] Achado real documentado: `operating_mode` já era buscado mas descartado no frontend —
      esta história corrige isso, não só adiciona a ação de correção

**Aprovação final**
- [x] Time (usuário) revisou e aprovou a solução técnica — "aprova o Ready do 148" (2026-09-01)
- [x] Estimativa acordada (5 pontos)
- [x] Sem bloqueios não resolvidos
- [x] Priorização aprovada para implementação imediata

**Status: Ready** — apta para implementação.
