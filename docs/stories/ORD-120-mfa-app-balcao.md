---
id: ORD-120
status: Ready
fase: 7
sprint: null
responsavel: Backend SR + Frontend
estimativa: P
tipo: bug
---

# ORD-120 — Suporte a duplo fator (MFA) no app de balcão

## User story
**Como** operador de balcão de uma empresa com política de MFA `required` ou `optional` (ORD-088),
**quero** conseguir fazer login no app de balcão normalmente, passando pelo mesmo fluxo de duplo fator que já existe no admin,
**para** não ficar bloqueado de usar o app — hoje o login falha silenciosamente pra qualquer empresa com MFA ativo.

## Contexto e motivação
Achado ao vivo (2026-08-24), testando a ORD-118: o usuário não conseguiu logar no `frontend/balcao` com `carlos@burgerhouse.com`. Investigação revelou a causa raiz — a Burger House tem `mfa_policy = "required"` (`services/company/main.py`), então **todo** login (`POST /auth/login`) responde `{"mfa_required": true, "mfa_status": "verify"|"setup_required", "mfa_token": ...}`, sem `access_token` nenhum. `frontend/balcao/src/screens/LoginScreen.tsx` (`handleSubmit`, linha 17-18) só lê `r.data.access_token` direto da resposta de `/auth/login` — nunca foi atualizado desde a ORD-088 pra reconhecer `mfa_required`. Resultado: a chamada retorna 200 (sucesso HTTP), mas sem token válido — o app não mostra erro nenhum (não cai no `catch`) e simplesmente não avança, parecendo travado.

Isso bloqueia **qualquer** usuário de **qualquer** empresa com MFA `required` (ou `optional` + usuário já com TOTP ativo) — não é específico da Burger House, é uma lacuna estrutural do app desde que a ORD-088 foi implementada só no admin.

## Fluxos envolvidos
- **Login (credenciais → MFA):** mesmo fluxo já existente e funcionando no `frontend/admin/src/screens/LoginScreen.tsx` — replicado no balcão com estilo próprio (inline styles, sem o pacote `design-system` vendorizado que o balcão não usa).
- **Setup de TOTP na primeira vez** (`mfa_status: "setup_required"`): QR code + código manual de fallback, confirma com código de 6 dígitos, mostra os 10 códigos de backup uma única vez.
- **Verificação de código** (`mfa_status: "verify"`, usuário já com TOTP ativo): campo de código de 6 dígitos ou código de backup.
- **Dispositivo confiável (ORD-092):** o balcão normalmente roda num dispositivo fixo no estabelecimento (tablet/computador do caixa) — faz sentido oferecer "confiar neste dispositivo", mesmo padrão do admin, evitando pedir MFA a cada turno de operador.

## Dependências / impacto em outros serviços
- **Nenhuma mudança de backend** — os endpoints já existem (`/auth/login`, `/auth/login/mfa-verify`, `/users/me/mfa/setup`, `/users/me/mfa/confirm`, ambos em company-service/auth-service, já usados pelo admin).
- **`frontend/balcao/nginx.conf`** e **`vite.config.ts`**: precisam de uma rota nova proxiada — `/users` (hoje só proxiam `/auth`, `/orders`, `/tickets`, `/ws`), já que os endpoints de setup/confirm de MFA vivem em `/users/me/mfa/*` no company-service, fora do prefixo `/auth`.
- **`frontend/balcao/package.json`**: precisa de `qrcode.react` (já usado no admin e no totem) pra desenhar o QR do setup — o balcão só tem `jsqr` hoje, que é decodificador, não gerador.
- **Novo módulo `deviceTrust.ts`** no balcão, mesmo padrão do admin (`getDeviceTrustToken`/`setDeviceTrustToken` via localStorage) — não existe hoje no balcão.

## Cenários (QA Explorer)

```gherkin
Funcionalidade: MFA no app de balcão

  Cenário: Login normal quando a empresa não exige MFA
    Dado um usuário de uma empresa com mfa_policy "disabled"
    Quando ele faz login com email e senha corretos
    Então entra direto na fila de pedidos, sem passo extra

  Cenário: Primeiro login com MFA obrigatório (setup)
    Dado um usuário de uma empresa com mfa_policy "required" que nunca configurou TOTP
    Quando ele faz login com email e senha corretos
    Então vê a tela de configuração de MFA (QR code + código manual)
    E ao digitar o código de 6 dígitos correto do app autenticador, ativa o MFA
    E vê os 10 códigos de backup uma única vez
    E ao confirmar, precisa digitar um código pra entrar (mesmo fluxo de verificação)

  Cenário: Login com MFA já configurado
    Dado um usuário com TOTP já ativo
    Quando ele faz login com email e senha corretos
    Então vê a tela de código de 6 dígitos
    E ao digitar o código correto, entra na fila de pedidos

  Cenário: Confiar no dispositivo
    Dado um usuário na tela de código de verificação
    Quando ele marca "confiar neste dispositivo" e confirma o código
    Então da próxima vez que fizer login nesse mesmo navegador, pula direto pra dentro (sem pedir MFA de novo), mesmo comportamento do admin (ORD-092)

  Cenário: Código inválido
    Dado um usuário na tela de código (setup ou verificação)
    Quando digita um código incorreto
    Então vê mensagem de erro clara, sem travar a tela nem perder o mfa_token da sessão de login em andamento
```

## Solução técnica (Tech Explorer)
Porta quase 1:1 do fluxo já existente e testado em `frontend/admin/src/screens/LoginScreen.tsx`, adaptado ao estilo inline do balcão (sem `design-system`):

1. `frontend/balcao/package.json`: adicionar `qrcode.react` (mesma versão já usada em admin/totem).
2. `frontend/balcao/src/deviceTrust.ts` (novo): `getDeviceTrustToken()`/`setDeviceTrustToken()` via `localStorage`, mesmo padrão do admin.
3. `frontend/balcao/nginx.conf` + `vite.config.ts`: adicionar proxy de `/users` (mesmo padrão de `/auth`/`/orders`/`/tickets`).
4. `frontend/balcao/src/screens/LoginScreen.tsx`: reescrita com máquina de estados `Step = "credentials" | "setup-qr" | "backup-codes" | "code"`, replicando exatamente a lógica de `handleSubmit`/`handleConfirmSetup`/`handleVerifyCode` do admin — mesmos endpoints, mesmo payload, mesmo tratamento de erro — só a camada visual muda (inline styles, sem `Alert`/`Button`/`InputBase`/`Checkbox` do design system).

### Estimativa
**P** — cópia adaptada de um fluxo já implementado e testado, sem mudança de backend.

## Fora de escopo
- Qualquer mudança no fluxo de MFA em si (isso já está pronto desde a ORD-088/092) — esta história é só portar o cliente que faltava.

## Próximos passos
Ready — solução é replicar 1:1 um fluxo já existente, sem ambiguidade. Implementar imediatamente (bloqueava teste ao vivo da ORD-118).
