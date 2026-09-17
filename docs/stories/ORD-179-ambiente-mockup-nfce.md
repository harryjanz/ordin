---
id: ORD-179
status: Ready
estimativa: 3 pontos (2 backend + 1 frontend)
fase: null
sprint: null
responsavel: Backend SR + Frontend
---

# ORD-179 — Ambiente "Mockup" pra visualizar a impressão da NFC-e em dev

## Descrição
Ajuste ao épico fiscal, pedido direto pelo usuário durante o teste ao vivo da ORD-172: não dá
pra validar visualmente o bloco de NFC-e impresso (chave de acesso + QR, ORD-172) sem uma emissão
real autorizada pela Focus NFe — que por sua vez exige certificado A1 real de CNPJ ativo (mesmo
bloqueio de sempre, `docs/estudo-nfce.md`). Isso trava qualquer validação visual em ambiente de
desenvolvimento. Esta história adiciona um terceiro valor de `ambiente`
(`"homologacao"`/`"producao"`/**`"mockup"`**) que, quando selecionado, faz o `payment-service`
**fabricar** uma resposta de emissão autorizada (sem chamar a Focus NFe de verdade), só pra
exercitar o pipeline de impressão ponta a ponta.

**Risco central desta história, não técnico**: `mockup` sempre retorna "autorizada" com dado
fake — se ligado por engano numa empresa cliente real em produção, o cliente teria a falsa
impressão de estar emitindo notas fiscais válidas quando não está. Ver mitigação na seção Tech
Explorer (`FISCAL_MOCKUP_ENABLED`, env var de plataforma, não por empresa).

## Persona
**Superadmin/Admin da plataforma Ordin** — mesma persona e mesma aba "Fiscal" de toda história do
épico. Não é uma opção pro owner/manager da empresa cliente ver ou escolher.

## Explorer

### História
Como **integrante do time Ordin**, quero um modo de emissão fictícia que gera chave/QR fake, para
validar visualmente o layout impresso da NFC-e no totem sem depender de certificado A1 real nem
de um cliente-piloto.

### Decisão de escopo
- `ambiente` vira enum de 3 valores: `homologacao` (default) | `producao` | `mockup`.
- Quando `ambiente == "mockup"` e `ativo == true`: `emit_nfce_if_active` (payment-service, ORD-171)
  **não chama a Focus NFe** — monta e salva um `FiscalDocument` com `status="autorizada"`,
  `chave_nfe` fake (44 dígitos, gerados a partir do `order_ref`, sem significado fiscal real) e
  `qrcode_url` fake apontando pra um domínio óbvio de teste (`https://mockup.ordin.local/...`),
  sem nenhuma rede envolvida.
- Continua exigindo os mesmos gates de sempre pra ativar (`focus_nfe_cadastrado=true`, mesmo
  critério da ORD-170/178 — o admin ainda passa pelo cadastro normal, só troca o ambiente depois).
- **Mitigação do risco central**: uma env var de plataforma nova, `FISCAL_MOCKUP_ENABLED`
  (payment-service, default `false`) — se não estiver ligada, `ambiente="mockup"` **não fabrica
  nada**, cai no mesmo caminho de `homologacao` (tenta a chamada real, que falha sem token válido
  e vira "pendente", comportamento seguro). Só quando o time Ordin liga essa env var
  explicitamente (ambiente de desenvolvimento/staging) o mockup fabrica dado de verdade. Evita que
  a opção "Mockup" no dropdown vire um risco automático assim que existir no banco de dados — a
  fabricação de dado fake é opt-in também no nível de infraestrutura, não só de configuração por
  empresa.

### Fluxo principal
1. Admin já passou pelo cadastro fiscal (ORD-168) e tem `focus_nfe_cadastrado=true` (via ORD-170
   ou via ORD-178 — cadastro manual com token fake já serve, já que mockup nem usa o token de
   verdade).
2. Na aba Fiscal, troca "Ambiente" pra "Mockup (teste — gera NFC-e fictícia)".
3. Ativa "Emissão de NFC-e" (mesmo toggle/confirmação da ORD-171).
4. Faz uma venda de teste no totem — pagamento aprovado dispara `emit_nfce_if_active`, que
   (com `FISCAL_MOCKUP_ENABLED=true` no ambiente de dev) fabrica a resposta autorizada na hora,
   sem rede.
5. Totem imprime o bloco de NFC-e (ORD-172) com a chave/QR fake — dá pra ver o layout completo.

### Fluxos alternativos / exceções
- **`FISCAL_MOCKUP_ENABLED=false`** (produção, se um dia existir): `ambiente="mockup"` se
  comporta como `homologacao` — tenta a chamada real, falha, vira "pendente". Nunca fabrica dado.
- **Sem certificado/CSC completos**: mesmo gate de sempre, não muda.

### Dependências
- **company-service**: `ambiente_valido` aceita o valor novo; nenhuma mudança de modelo (mesma
  coluna `ambiente` já existente, ORD-171).
- **payment-service**: `emit_nfce_if_active` ganha o desvio de mockup; env var nova
  `FISCAL_MOCKUP_ENABLED`.
- **frontend/admin**: `AMBIENTE_OPTIONS` ganha a terceira opção.
- **Histórias bloqueantes**: ORD-171 (Ready/implementada), ORD-172 (Ready/implementada nesta
  sessão) — mockup só faz sentido pra validar o que a ORD-172 imprime.

### Critérios de aceite funcionais
- [ ] `ambiente` aceita `"mockup"` na escrita (`PUT /companies/{id}/fiscal-config`)
- [ ] Com `FISCAL_MOCKUP_ENABLED=true` e `ambiente=mockup` e `ativo=true`: emissão fabrica
      `FiscalDocument` autorizado sem chamar rede externa
- [ ] Com `FISCAL_MOCKUP_ENABLED=false` (ou ausente): `ambiente=mockup` não fabrica nada, cai no
      caminho real (mesmo comportamento de homologação)
- [ ] `owner`/`manager` continuam sem acesso a trocar `ambiente` (mesmo gate de sempre)

## QA Explorer

### Cenários Gherkin

```gherkin
Feature: Ambiente Mockup pra visualizar a NFC-e em dev
  Como integrante do time Ordin
  Quero uma emissão fictícia sem depender da Focus NFe real
  Para validar o layout impresso da NFC-e em ambiente de desenvolvimento

  Scenario: Emissão fabricada com FISCAL_MOCKUP_ENABLED ligado
    Dado que o payment-service tem FISCAL_MOCKUP_ENABLED=true
    E uma empresa com ambiente="mockup" e módulo de emissão ativo
    Quando um pagamento é aprovado
    Então nenhuma chamada de rede é feita à Focus NFe
    E um FiscalDocument com status "autorizada" e chave/QR fake é salvo

  Scenario: FISCAL_MOCKUP_ENABLED desligado ignora o mockup
    Dado que o payment-service tem FISCAL_MOCKUP_ENABLED=false (ou ausente)
    E uma empresa com ambiente="mockup" e módulo de emissão ativo
    Quando um pagamento é aprovado
    Então o payment-service tenta a chamada real à Focus NFe (mesmo caminho de homologação)
    E, sem token válido, o documento fica "pendente" — nunca fabrica dado

  Scenario: Owner não troca o ambiente pra mockup
    Dado um usuário autenticado com role "owner"
    Quando esse usuário tenta enviar ambiente="mockup" via API direta
    Então o sistema retorna 403
```

### Critérios de aceite testáveis
- [ ] Mockup fabrica dado só com a env var explicitamente ligada
- [ ] Sem a env var, comportamento idêntico ao ambiente de homologação (nunca fabrica)
- [ ] `owner`/`manager` recebem 403 ao tentar mudar `ambiente`

### O que ainda impede o avanço pro Tech Explorer
Nada bloqueante.

## Tech Explorer

### Serviços impactados
- **company-service**: `FiscalConfigIn.ambiente_valido` aceita `"mockup"`.
- **payment-service**: `emit_nfce_if_active` ganha desvio de mockup; env var
  `FISCAL_MOCKUP_ENABLED` lida via `os.getenv` (não `require_env` — tem default seguro `false`,
  diferente de segredo obrigatório).
- **frontend/admin**: `AMBIENTE_OPTIONS` (`CompanyScreen.tsx`) ganha `"mockup"`.

### Mudança em `emit_nfce_if_active` (payment-service)
```python
FISCAL_MOCKUP_ENABLED = os.getenv("FISCAL_MOCKUP_ENABLED", "").strip().lower() == "true"

# dentro de emit_nfce_if_active, logo após confirmar creds["ativo"]:
if creds["ambiente"] == "mockup" and FISCAL_MOCKUP_ENABLED:
    chave_fake = _build_mockup_chave(order_ref)
    await _save_fiscal_document(
        order_ref, company_id, "mockup", status="autorizada",
        chave_nfe=chave_fake,
        qrcode_url=f"https://mockup.ordin.local/qrcode/{chave_fake}",
    )
    return
```
`_build_mockup_chave(order_ref)` gera 44 dígitos numéricos determinísticos a partir do
`order_ref` (hash simples + padding) — só precisa ter o formato certo pra `formatChaveAcesso`
(ORD-172, frontend) exibir igual a uma chave real, sem nenhum significado fiscal.

### Migrations
Nenhuma — `ambiente` já é `String(12)`, cabe `"mockup"` sem alterar schema.

### Eventos de fila
Nenhum.

### Riscos
1. **Mockup fabricar dado em produção por engano** — mitigado pela env var de plataforma
   (`FISCAL_MOCKUP_ENABLED`), não configurável por empresa, só por quem sobe o container.
2. **Confundir chave fake com chave real numa investigação futura** — mitigado por gerar a chave
   de forma claramente derivada do `order_ref` (não aleatória), e pelo próprio `ambiente="mockup"`
   salvo no `FiscalDocument`, visível em qualquer consulta.

### O que ainda impede o avanço pro Ready
Nada bloqueante.

## Ready

**Explorer:** [x] história · [x] decisão de escopo (3º valor de ambiente + env var de segurança)
· [x] fluxo principal · [x] dependências (ORD-171/172) · [x] critérios de aceite.

**QA Explorer:** [x] happy path (mockup fabricado) · [x] borda (env var desligada não fabrica) ·
[x] controle de acesso (owner 403) · [x] cenários aprovados.

**Tech Explorer:** [x] serviços impactados (company-service + payment-service + frontend) · [x]
mudança de código detalhada · [x] migrations — nenhuma · [x] riscos com mitigação (env var de
plataforma).

**Status: Ready.** Escopo pequeno, isolado, com mitigação de risco explícita antes de implementar.
