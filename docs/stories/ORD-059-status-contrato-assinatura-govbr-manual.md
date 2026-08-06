---
id: ORD-059
status: Done
fase: 4
sprint: null
responsavel: Backend SR
estimativa: 3 pontos
---

# ORD-059 — Rastreio de status do contrato (envio por e-mail, assinatura externa via gov.br)

## Descrição
Depois de cadastrar a empresa (ORD-056/057) e o responsável legal (ORD-058), o super admin envia o contrato **manualmente por e-mail** para assinatura via **gov.br** — o ordin não implementa envio automático de e-mail nem integração de assinatura eletrônica neste momento (confirmado explicitamente pelo usuário: "vou enviar o contrato para assinatura manualmente"). Esta história cria apenas o **rastreio de status** desse processo dentro da plataforma: pendente → enviado → assinado, com o PDF assinado anexável e histórico auditável.

## Persona
**Super admin**, que registra manualmente cada etapa do processo de contrato depois de executá-la fora da plataforma.

## Contexto
Sem esse rastreio, não há como saber pela plataforma se uma empresa ativa já tem contrato assinado ou não — informação hoje só existiria informalmente (caixa de e-mail do admin). Também dá insumo para decisões futuras (ex: bloquear operação de empresas sem contrato assinado), sem precisar disso agora.

---

## Explorer

## História
Como **super admin**, quero registrar quando enviei o contrato por e-mail e quando ele foi assinado (anexando o PDF assinado via gov.br), para ter visibilidade do status de cada cliente sem depender de controle paralelo fora do sistema.

### Contexto e motivação
O fluxo real é: 1) admin cadastra a empresa no ordin (ORD-056/057/058), 2) admin gera/obtém o contrato (fora do escopo desta história — pode ser um template preenchido manualmente), 3) admin envia por e-mail pedindo assinatura via gov.br, 4) responsável legal assina no gov.br e devolve o PDF assinado, 5) admin registra que está assinado e anexa o PDF. O ordin só precisa participar dos passos 1, 3 (registro do evento, não o envio em si) e 5.

### Personas afetadas
- **Super admin**: registra as transições de status
- **Compliance/Financeiro**: consulta quais empresas ativas não têm contrato assinado

### Fluxo principal
1. Empresa é criada (ORD-056) com `contract_status = "pendente"` automaticamente
2. Depois de enviar o e-mail manualmente (fora do sistema), admin marca `PATCH /companies/{id}/contract-status` com `status="enviado"` — sistema registra a data
3. Depois de receber o PDF assinado do gov.br, admin marca `status="assinado"`, anexando o arquivo PDF — sistema registra a data de assinatura e a URL/path do arquivo
4. Toda mudança de status é registrada no audit log (reaproveitando `emit_audit`, ORD-018)

### Fluxos alternativos / exceções
- Tentar pular etapa (ex: "pendente" → "assinado" direto, sem passar por "enviado") — a decidir na Tech Explorer se é bloqueado ou permitido (admin pode ter enviado por outro canal antes de o rastreio existir)
- Tentar marcar "assinado" sem anexar arquivo → 422

### Dependências
- Serviços envolvidos: `company-service` apenas
- Histórias bloqueantes: **ORD-058** (soft — faz sentido ter o responsável legal cadastrado antes de rastrear o envio do contrato a ele, mas não é um bloqueio técnico rígido)
- Reaproveita: `services/shared/audit.py` (ORD-018) para o histórico de mudança de status

### Critérios de aceite funcionais
- [ ] Nova empresa nasce com `contract_status = "pendente"`
- [ ] Admin consegue marcar "enviado" com data registrada automaticamente
- [ ] Admin consegue marcar "assinado" anexando um PDF, com data registrada automaticamente
- [ ] Tentar marcar "assinado" sem anexo é rejeitado
- [ ] Toda mudança de status gera uma linha de audit log (`contract_status_changed`)
- [ ] Isolamento multi-tenant nas consultas de status

### Wireframe / Mockup
N/A — tela de "status do contrato" no admin fica para história de frontend futura.

### Ponto em aberto para o PM
Se `contract_status != "assinado"` deveria **bloquear** alguma operação da empresa (ex: emissão de terminal, ativação de pagamento real) ou ser apenas informativo por enquanto. Esta história entrega só o rastreio — a decisão de gate fica registrada como próxima conversa, não implementada aqui.

---

## QA Explorer

```gherkin
Feature: Rastreio de status do contrato (envio manual por e-mail, assinatura via gov.br)
  Como super admin
  Quero registrar o status do contrato de cada empresa
  Para ter visibilidade sem depender de controle paralelo fora do sistema

  Background:
    Dado que estou autenticado como super admin
    E existe uma empresa "Burger House" (company_id=1) recém-criada

  Scenario: Nova empresa nasce com contrato pendente
    Quando consulto a empresa recém-criada
    Então contract_status é "pendente"

  Scenario: Marcar contrato como enviado (happy path)
    Quando envio PATCH /companies/1/contract-status com status="enviado"
    Então a resposta é 200
    E contract_sent_at é preenchido com a data/hora atual
    E uma linha de audit log "contract_status_changed" é emitida com result=success

  Scenario: Marcar contrato como assinado com PDF anexado (happy path)
    Dado que o contrato já está "enviado"
    Quando envio PATCH /companies/1/contract-status com status="assinado" e um arquivo PDF anexado
    Então a resposta é 200
    E contract_signed_at é preenchido
    E contract_document_url aponta para o arquivo armazenado

  Scenario: Marcar como assinado sem anexar arquivo é rejeitado
    Quando envio PATCH /companies/1/contract-status com status="assinado" sem nenhum arquivo
    Então a resposta é 422

  Scenario: Histórico de mudanças é auditável
    Dado que o contrato passou por pendente → enviado → assinado
    Quando busco os logs de audit da empresa 1
    Então existem 2 eventos "contract_status_changed" (um para cada transição), cada um com quem executou e quando

  Scenario: Isolamento multi-tenant no status do contrato
    Dado que a empresa 2 também tem um contrato em andamento
    Quando um usuário da empresa 1 tenta ver ou alterar o status do contrato da empresa 2
    Então a resposta é 403
```

**Aprovado pelo PM.** O cenário de "pular etapa" (pendente→assinado direto) foi deixado como decisão técnica aberta para o Tech Explorer resolver, não como critério de aceite fechado — ver seção Tech Explorer.

---

## Tech Explorer

### Serviços impactados
- **company-service**: nova coluna de status + endpoint de transição + upload de arquivo.

### Migrations
Nova migration, `down_revision` apontando para a mais recente da cadeia (ORD-058) no momento em que esta história for implementada:

```sql
ALTER TABLE companies
  ADD COLUMN contract_status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  ADD COLUMN contract_sent_at DATETIME NULL,
  ADD COLUMN contract_signed_at DATETIME NULL,
  ADD COLUMN contract_document_url VARCHAR(255) NULL;
```

### Decisão técnica: transição de estado
Permitir pular direto para "assinado" a partir de "pendente" **é permitido** (não bloqueado) — o admin pode legitimamente já ter enviado o contrato por outro canal antes de esta funcionalidade existir, ou preferir registrar tudo de uma vez ao receber o PDF assinado. O que é **bloqueado**: regressão de "assinado" para "pendente"/"enviado" via este endpoint (se precisar corrigir um erro de registro, é uma operação manual direta no banco, não um caso de uso da API — evita perda acidental de rastro de auditoria).

### Endpoints

#### PATCH /companies/{company_id}/contract-status
**Auth:** JWT | role: `superadmin`
Request (multipart/form-data quando `status="assinado"`, por causa do anexo):
```
status: "enviado" | "assinado"
signed_document: file (obrigatório apenas quando status="assinado")
```
Response 200: empresa atualizada com os novos campos de contrato
Erros: 422 (status="assinado" sem arquivo; ou tentativa de regressão de status), 403, 404

### Armazenamento do arquivo
**Decisão a validar com backend antes de implementar**: o projeto não tem hoje nenhum mecanismo de upload/armazenamento de arquivo em nenhum serviço (levantamento técnico confirmou ausência total). Para o MVP local, gravar em disco local do container (`/app/uploads/contracts/{company_id}/`) com `contract_document_url` apontando para um path servido estaticamente; documentar como débito técnico que **precisa** virar S3 antes de produção (`ARQUITETURA.md` já prevê infraestrutura AWS — este é o primeiro caso de uso de armazenamento de arquivo do projeto, vale abrir a decisão de bucket S3 dedicado quando chegar a hora do deploy).

### Auditoria
Reaproveita `services/shared/audit.py` (ORD-018) — `emit_audit("contract_status_changed", request, actor=..., actor_id=..., company_id=..., result="success", detail={"from": status_anterior, "to": status_novo})`.

### Impacto em outros serviços
Nenhum.

### Eventos de fila
Não aplicável — mudança de status de contrato não tem consumidor hoje. Se no futuro o gate de "bloquear operação sem contrato assinado" for implementado, aí sim caberia um evento `contract.signed` — fora de escopo aqui.

### Estimativa
- Backend: 3 pontos (coluna + endpoint + upload local simples + audit)

### Riscos
- Upload de arquivo em disco local do container é **não durável** em ambiente com múltiplas réplicas/deploys (arquivo se perde em redeploy) — aceitável para desenvolvimento/piloto local, mas é um bloqueador real antes de qualquer deploy em staging/produção. Registrar explicitamente essa limitação para não ser esquecida.

---

## Ready

**Explorer:** [x] (com 1 ponto em aberto para o PM sobre gate futuro, não bloqueia esta entrega) · **QA Explorer:** [x] happy paths de cada transição, rejeição sem anexo, auditoria, isolamento multi-tenant · **Tech Explorer:** [x] migration, endpoint, decisão de transição de estado, risco de armazenamento não durável documentado · **Aprovação final:** [x] solução técnica definida, estimativa 3 pontos, risco de storage local aceito conscientemente como limitação de piloto — pendente apenas priorização de sprint.

**Status: Ready.**
