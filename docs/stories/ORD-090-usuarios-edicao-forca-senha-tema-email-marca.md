---
id: ORD-090
status: Done
fase: 6
sprint: null
responsavel: Backend + Frontend
estimativa: 8 pontos
---

# ORD-090 — Usuários: editar nome/papel, força de senha, tema padrão claro e e-mail com identidade visual

## Descrição
Pedido direto do usuário, um pacote de ajustes na mesma área de trabalho do [[ORD-087]]/[[ORD-089]] antes de seguir pro [[ORD-088]] (2FA):

1. Novos usuários (via convite) sempre começam com tema **claro**, não escuro
2. Validação de força de senha (Fraca/Média/Forte) ao definir/trocar senha, mínimo aceito: **Média**
3. Botões de ação da listagem de Usuários sempre alinhados à direita
4. E-mail de convite ganha identidade visual: cabeçalho com o wordmark do Ordin, assinatura da equipe, e-mail de suporte e WhatsApp de contato
5. Editar usuário — hoje só dá pra criar (convidar) e desativar/reativar; falta editar **nome** e **papel** de um usuário existente

Decisões fechadas com o usuário (2026-08-14):
- Senha mínima aceita: **Média** (8+ caracteres, letra+número+especial). O medidor mostra as 3 classificações em tempo real, mas só bloqueia salvar abaixo de Média.
- Tema: como hoje é só preferência de navegador (localStorage, nunca foi por conta), a solução é mudar o **padrão global** de `dark` para `light` — não vale a pena criar preferência por conta no backend só por causa disso.
- Logo do e-mail: **wordmark de texto** (mesmo tratamento visual do "ordin" roxo/negrito já usado no admin) — não existe arquivo de logo nem hospedagem de imagem pública configurada (Fase 2 ainda bloqueada).

## Persona
**Owner/manager** (edita usuários, convida, vê o tema padrão) e o **usuário convidado** (define senha, vê o e-mail com identidade visual, herda o tema claro no primeiro login).

## Contexto

### Achado 1 — tema é preferência de navegador, não de conta
`frontend/admin/src/store.ts:43`: `adminThemeMode: "dark"` — estado inicial do Zustand, persistido via `zustand/middleware` `persist` no `localStorage` do navegador. Não existe nenhuma coluna no backend associando tema a um usuário. Mudar o padrão pra `"light"` resolve o pedido na prática (qualquer sessão nova, inclusive de um usuário recém-convidado, nasce clara), mas afeta tecnicamente qualquer navegador que nunca abriu o admin antes — não é literalmente "por conta". Decisão já tomada acima.

### Achado 2 — validação de senha hoje é só comprimento
`services/company/main.py`, `CompleteRegistrationIn._password_min_length`: só verifica `len(v) < 8`. Nenhuma verificação de tipo de caractere, nenhuma classificação.

### Achado 3 — `UserUpdate` não tem campo `name`
`services/company/main.py:451-453`: `UserUpdate` só tem `role` e `active`. O endpoint `PUT /companies/{id}/users/{id}` já existe e já tem toda a lógica de permissão de papel (`manager` não promove a `owner`, ninguém muda o próprio papel) — só falta o campo `name` no schema e a linha que aplica.

### Achado 4 — não existe nenhuma UI de edição na tela de Usuários
`CompanyScreen.tsx`, aba Usuários: as únicas ações por linha hoje são Desativar/Reativar (ORD-089) e Reenviar convite (ORD-087). Nenhum botão "Editar".

### Achado 5 — e-mail de convite é só texto simples
`services/notification/main.py`, `_build_invite_html`: título, descrição do papel, botão — sem cabeçalho, sem rodapé, sem nenhuma identidade visual ou contato de suporte.

### Achado 6 — botões da coluna de ação não são alinhados à direita
`CompanyScreen.tsx`, coluna `action` da `Table`: `<div style={{ display: "flex", gap: 8 }}>` sem `justifyContent` — os botões ficam colados à esquerda da célula, não "no canto direito da tela" como pedido.

---

## Explorer

### História
Como **owner/manager**, quero poder corrigir o nome e o papel de um usuário sem precisar desativar e recriar, ter confiança de que os convidados vão definir senhas seguras, ver os botões da listagem sempre organizados à direita, e que o e-mail de convite pareça profissional e confiável — e como **usuário convidado**, quero abrir o admin pela primeira vez num tema claro e legível.

### Fluxo principal
1. Owner/manager clica em "Editar" na linha de um usuário → formulário inline (mesmo padrão da `PaymentTab`) com Nome e Papel pré-preenchidos → salva ou cancela
2. Usuário convidado abre `/set-password`, digita a senha → vê em tempo real a classificação (Fraca/Média/Forte) → só consegue submeter com Média ou Forte
3. Usuário convidado conclui o cadastro e faz login pela primeira vez → interface abre no tema claro
4. E-mail de convite chega com cabeçalho "ordin" (wordmark), corpo já existente (nome, papel, botão), e rodapé "Equipe Ordin · suporte@ordin.com · WhatsApp (XX) XXXXX-XXXX"
5. Botões de ação na listagem de Usuários (Editar, Desativar/Reativar, Reenviar convite) sempre alinhados à direita da coluna

### Critérios de aceite
- [ ] `adminThemeMode` inicial muda de `"dark"` para `"light"`
- [ ] `SetPasswordScreen` mostra classificação em tempo real (Fraca/Média/Forte) enquanto o usuário digita
- [ ] Critério: Média = 8+ caracteres com letra, número e caractere especial · Forte = mesmo critério com 12+ caracteres · Fraca = qualquer coisa abaixo de Média
- [ ] Submissão bloqueada (client e servidor) se a senha for classificada como Fraca
- [ ] `UserUpdate` aceita `name`; `PUT /companies/{id}/users/{id}` aplica a mudança
- [ ] Botão "Editar" por linha na listagem de Usuários, abre formulário inline com Nome + Papel, mesmas regras de permissão de papel já existentes (manager não promove a owner, ninguém edita o próprio papel)
- [ ] Ação de editar não altera e-mail nem status — só nome e papel
- [ ] E-mail de convite ganha cabeçalho com wordmark "ordin" e rodapé com assinatura, e-mail de suporte e WhatsApp
- [ ] Botões de ação da listagem de Usuários alinhados à direita da coluna

---

## QA Explorer

```gherkin
Feature: Ajustes de usuários — edição, força de senha, tema, e-mail

  Scenario: Tema padrão claro num navegador novo
    Dado um navegador que nunca abriu o admin antes
    Quando a página carrega pela primeira vez
    Então o tema inicial é claro, não escuro

  Scenario: Classificação de senha em tempo real
    Dado o usuário está na tela de definir senha
    Quando digita "abc123" (6 caracteres, sem especial)
    Então a classificação mostrada é "Fraca"
    Quando digita "abc12345!" (9 caracteres, letra+número+especial)
    Então a classificação muda para "Média"
    Quando digita "abc123456789!" (13 caracteres, letra+número+especial)
    Então a classificação muda para "Forte"

  Scenario: Senha Fraca é bloqueada
    Dado uma senha classificada como Fraca
    Quando o usuário tenta submeter
    Então o formulário não envia e mostra o motivo
    E, se de alguma forma chegar no backend, a API rejeita com 422

  Scenario: Senha Média é aceita
    Dado uma senha classificada como Média (8+ caracteres, letra+número+especial)
    Quando o usuário submete
    Então o cadastro é concluído com sucesso

  Scenario: Editar nome e papel
    Dado um owner logado e um usuário existente da empresa
    Quando clica em "Editar", muda o nome e o papel, e salva
    Então a listagem reflete o novo nome e papel
    E o e-mail e o status do usuário não mudam

  Scenario: Regras de permissão de papel preservadas na edição
    Dado um usuário com role "manager" logado
    Quando tenta editar outro usuário promovendo a "owner"
    Então recebe erro 403, mesmo comportamento já existente
    E quando tenta editar o próprio papel
    Então recebe erro 403, mesmo comportamento já existente

  Scenario: E-mail de convite com identidade visual
    Dado um convite disparado
    Então o e-mail contém o wordmark "ordin" no cabeçalho
    E contém rodapé com assinatura da equipe, e-mail de suporte e WhatsApp

  Scenario: Botões de ação alinhados à direita
    Dado a listagem de Usuários com uma ou mais ações por linha
    Então os botões ficam alinhados à direita da coluna, não à esquerda
```

---

## Tech Explorer

### Serviços impactados
- `frontend/admin/` — `store.ts` (tema padrão), `SetPasswordScreen.tsx` (medidor de força), `CompanyScreen.tsx`/`.module.scss` (editar, alinhamento)
- `services/company/` — `main.py` (`UserUpdate.name`, força de senha compartilhada com `complete_registration`)
- `services/notification/` — `main.py` (`_build_invite_html`, cabeçalho/rodapé)

### Direção técnica

**Classificação de força de senha — mesma regra nos dois lados:**
```python
# services/company/main.py
import re

def _password_strength(password: str) -> str:
    has_letter = bool(re.search(r"[A-Za-z]", password))
    has_digit = bool(re.search(r"\d", password))
    has_special = bool(re.search(r"[^A-Za-z0-9]", password))
    strong_chars = has_letter and has_digit and has_special
    if len(password) >= 12 and strong_chars:
        return "forte"
    if len(password) >= 8 and strong_chars:
        return "media"
    return "fraca"
```
`CompleteRegistrationIn._password_min_length` (renomear pra `_password_strength_valida`) passa a rejeitar (`ValueError`) quando `_password_strength(v) == "fraca"`, em vez de só checar `len(v) < 8`.

```tsx
// frontend/admin/src/screens/SetPasswordScreen.tsx
function passwordStrength(password: string): "fraca" | "media" | "forte" {
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strongChars = hasLetter && hasDigit && hasSpecial;
  if (password.length >= 12 && strongChars) return "forte";
  if (password.length >= 8 && strongChars) return "media";
  return "fraca";
}
```
Exibição via `Tag` (já no design system, sem componente novo): `variant="error"` (Fraca) / `variant="warning"` (Média) / `variant="success"` (Forte). Botão "Definir senha" desabilitado quando `passwordStrength(password) === "fraca"`.

**`UserUpdate` + `update_user`:**
```python
class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
```
```python
if body.name is not None:
    u.name = body.name
```
adicionado antes do `await db.commit()` já existente — nenhuma outra linha do endpoint muda.

**`CompanyScreen.tsx` — editar:**
Mesmo padrão de `editId`/`editValues` já usado na `PaymentTab` (linhas 144-148, 216-239 antes desta história): `editUserId`, `editUserValues` (`{name, role}`), botão "Editar" abre o form inline (Nome + Dropdown Papel + Salvar/Cancelar), `PUT /companies/{id}/users/{id}` com `{name, role}`.

**Alinhamento à direita:**
```tsx
{ key: "action", header: "", render: (u) => (
  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
    ...
  </div>
)}
```
Só adicionar `justifyContent: "flex-end"` ao container já existente — mudança de uma linha.

**`store.ts`:** `adminThemeMode: "dark"` → `adminThemeMode: "light"` — mudança de uma linha.

**`notification-service` — cabeçalho/rodapé do e-mail:**
```python
_EMAIL_HEADER = """
<div style="text-align:center; padding: 16px 0;">
  <span style="font-size: 22px; font-weight: 800; color: #7c3aed;">ordin</span>
</div>
"""
_EMAIL_FOOTER = """
<div style="border-top: 1px solid #eee; margin-top: 24px; padding-top: 16px; color: #888; font-size: 12px;">
  Equipe Ordin<br>
  suporte@ordin.com · WhatsApp (11) 91234-5678
</div>
"""
```
Envolvidos em volta do corpo já existente de `_build_invite_html`. E-mail de suporte e WhatsApp são placeholders — mesma natureza de "escrito mas não conectado" do `SESEmailProvider` (ORD-087): sem canal de suporte real configurado ainda, ajustar quando existir.

### Migrations
Nenhuma — `name` já é coluna existente em `User`, só faltava no schema Pydantic de update.

### Riscos
- Baixo em geral — reuso de padrões já validados (`PaymentTab` pro form de edição, `Tag` pro medidor, mesma validação client+server já usada em outros campos).
- Único cuidado: a regra de força de senha muda o comportamento de `complete_registration` — qualquer teste existente que use senha sem caractere especial (ex: `"senhaSegura123"` nos testes do ORD-087) passa a ser classificado como "média" (tem letra+número, falta verificar se tem especial — **não tem**, então cairia em "fraca" com a regra nova). Os testes do ORD-087 (`test_ord087_convite_email_senha.py`) usam senhas como `"senhaSegura123"`/`"senhaFernanda123"` — **sem caractere especial**, vão quebrar com a validação nova e precisam ser atualizados como parte desta história.

### Estimativa
8 pontos — mais que o [[ORD-089]] (5): mexe em 3 serviços diferentes, mas cada mudança individual é pequena e reaproveita padrão já existente (nenhuma abstração nova, nenhuma migration).

---

## Ready

**Explorer:** [x] fluxo, persona e critérios de aceite definidos para os 5 itens do pacote · **QA Explorer:** [x] cenários Gherkin cobrindo tema, classificação de senha (todas as transições), bloqueio de Fraca, edição com regras de permissão preservadas, e-mail com identidade visual, alinhamento · **Tech Explorer:** [x] direção técnica completa nos 3 serviços, sem migration, risco de quebrar testes do ORD-087 já identificado antes de acontecer · **Aprovação final:** [x] decisões de mínimo de senha (Média), tema (mudar padrão global) e logo (wordmark de texto) aprovadas no chat pelo usuário (2026-08-14)

**Status: Ready** — pode começar a implementação.

---

## Downstream

- **Branch:** `feature/ord-090-usuarios-edicao-forca-senha-tema-email`, a partir de `main`.
- **`services/company/main.py`:** `_password_strength()` implementada exatamente como planejado no Tech Explorer; `CompleteRegistrationIn` (validador renomeado `_password_min_strength`) passa a rejeitar com `"Senha fraca — use ao menos 8 caracteres com letra, número e caractere especial."` em vez de só checar comprimento; `UserUpdate` ganhou `name: Optional[str] = None`; `update_user` aplica `u.name` quando presente, sem tocar na lógica de permissão de papel já existente.
- **`services/company/tests/test_ord087_convite_email_senha.py`:** risco antecipado no Tech Explorer se confirmou — senhas como `"senhaSegura123"`/`"outraSenha123"` (sem caractere especial) passaram a ser classificadas como Fraca pela regra nova; corrigidas para `"senhaSegura123!"`/`"outraSenha123!"` (8 ocorrências).
- **`services/company/tests/test_ord090_forca_senha_edicao_usuario.py` (novo):** 9 testes — classificação unitária de `_password_strength` (fraca/média/forte nas bordas de 8 e 12 caracteres), rejeição de senha sem especial via `POST /users/complete-registration` (com `respx` mockando o notification-service), edição de nome+papel, edição que não altera e-mail/status, regra de permissão preservada (manager não promove a owner).
- **Suíte completa do company-service:** **214 passed**, 1 falha pré-existente e não relacionada (`test_require_superadmin_raises_for_owner`, já documentada nos stories anteriores).
- **`services/notification/main.py`:** `_EMAIL_HEADER`/`_EMAIL_FOOTER` envolvendo o corpo já existente de `_build_invite_html` — wordmark "ordin" roxo/negrito no topo, rodapé com "Equipe Ordin", `suporte@ordin.com` e WhatsApp (ambos placeholders, mesma natureza do `SESEmailProvider` do ORD-087).
- **`services/notification/tests/test_notification.py`:** `test_send_invite_happy_path` ganhou 2 asserts (wordmark e e-mail de suporte no HTML) — **8 passed**.
- **`frontend/admin/src/store.ts`:** `adminThemeMode` inicial mudou de `"dark"` para `"light"`.
- **`frontend/admin/src/screens/SetPasswordScreen.tsx`:** medidor de força em tempo real (`Tag` do design system, variantes error/warning/success), botão "Definir senha" desabilitado quando Fraca, mesma regra replicada em TS (comentário cruzado com o backend avisando que mudança num lado exige mudança no outro).
- **`frontend/admin/src/screens/CompanyScreen.tsx`:** botão "Editar" por linha, formulário inline (Nome + Dropdown Papel, mesmo padrão de `PaymentTab`), coluna de ação com `justifyContent: "flex-end"`.
- `tsc --noEmit`: limpo. `vitest run`: **48 passed**, sem regressão.
- **Lint delta (ruff, `services/company` + `services/notification`) contra `origin/main` via `git worktree`:** branch com 315 achados vs. 312 em `main` — as 3 diferenças (`UP045` em `company/main.py`, `DTZ003` e `I001` no novo arquivo de teste) são todas de categorias já pervasivas na dívida técnica pré-existente do projeto, nenhuma categoria nova introduzida.
- **Verificado ao vivo no Chrome** (owner `carlos@burgerhouse.com`, sessão com `localStorage` limpo para simular navegador novo): tela de login já carrega no tema claro antes mesmo do login (confirma o novo padrão global); edição de nome de usuário salva e reflete na listagem imediatamente; convite disparado, e-mail recebido no Mailtrap real com wordmark no cabeçalho e assinatura/suporte/WhatsApp no rodapé; link do e-mail abre `/set-password` com token válido, medidor mostra Fraca → Média → Forte em tempo real conforme a senha digitada, botão habilita só a partir de Média; senha definida com sucesso e usuário convidado desaparece da lista de "Convite pendente" na listagem. Usuário e token de teste removidos do banco compartilhado ao final.
- PR aberta para `main`.
