---
id: ORD-148
status: New
fase: null
sprint: null
responsavel: null
estimativa: null
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
