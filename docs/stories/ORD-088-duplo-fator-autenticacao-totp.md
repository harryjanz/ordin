---
id: ORD-088
status: New
fase: null
sprint: null
responsavel: null
estimativa: null
---

# ORD-088 — Duplo fator de autenticação (TOTP), opcional por empresa

## Descrição
Pedido do usuário na abertura da sprint de cadastro de usuários (2026-08-13): adicionar duplo fator de autenticação no login, com cada empresa podendo optar por habilitá-lo ou não para seus próprios usuários.

## Persona
Owner/manager (decide se a própria empresa exige 2FA) e todo usuário autenticado da empresa que o habilitar (owner/manager/cashier).

## Contexto
Avaliação feita e decisão de método já tomada com o usuário (2026-08-13), **método e escopo aprovados, mas story explicitamente adiada para a sprint seguinte** — depende de [[ORD-087]] (login sem senha imposta pelo admin, fluxo de auto-cadastro) estar estável em produção primeiro, por mexer no mesmo fluxo de autenticação (`auth-service`, `App.tsx`).

**Método decidido:** TOTP (RFC 6238) — compatível com Google Authenticator, Authy, 1Password, Microsoft Authenticator. Preferido a SMS OTP por não ter custo por mensagem (sem dependência de SNS/Twilio) e por não ter a fragilidade de SIM swap que o SMS tem (NIST não recomenda SMS como único segundo fator).

**Escopo por empresa:** habilitação fica em Configurações, mesmo padrão de campo que hoje existe para tema/modo visual (`VALID_THEMES`/`VALID_MODES`, `AppearanceIn` em `services/company/main.py:434-438`) — provável novo campo `mfa_required` (ou `mfa_policy: disabled|optional|required`) na tabela `companies`.

Este documento **não é um Explorer completo** — captura a decisão de método e o motivo, para não se perder até a próxima sprint rodar o upstream (`/upstream-explorer` em diante) de verdade.

## Próximos passos (quando esta história for retomada)
- Rodar Explorer/QA Explorer/Tech Explorer completos antes de qualquer código (regra do projeto, sem exceção)
- Decidir: TOTP obrigatório desde o setup ou opt-in por usuário dentro de uma empresa que habilitou?
- Decidir: códigos de backup/recuperação — como reemitir se o usuário perder o dispositivo autenticador?
- Mapear onde o segredo TOTP é gerado/validado — provavelmente `auth-service` (dono do fluxo de login), não `company-service`
