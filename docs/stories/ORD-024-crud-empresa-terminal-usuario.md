---
id: ORD-024
status: New
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-024 — CRUD de empresa, terminal e usuário

## Descrição
O `company-service` só expõe endpoints internos (consumidos pelo auth-service) e um endpoint de regeneração de PIN. Não há como gerenciar empresas, terminais e usuários via API — tudo é feito direto no banco. É necessário implementar o CRUD de gestão para que o admin panel funcione.

## Contexto
O modelo de dados completo já existe (`Company`, `User`, `Terminal`). Os endpoints de gestão devem respeitar os roles: super admin gerencia empresas; owner/manager gerencia terminais e usuários da própria empresa. `company_id` sempre do JWT. Conforme `docs/ARQUITETURA.md` §6.

## Endpoints necessários

**Empresas (apenas super admin):**
- `GET /companies` — listar empresas com paginação
- `POST /companies` — criar empresa
- `GET /companies/{id}` — detalhe
- `PUT /companies/{id}` — editar nome, documento, plano
- `DELETE /companies/{id}` — desativar (soft delete)

**Terminais (owner/manager da empresa):**
- `GET /companies/{id}/terminals` — já existe, adicionar paginação
- `POST /companies/{id}/terminals` — criar terminal
- `PUT /companies/{id}/terminals/{terminal_id}` — editar label, TEF
- `DELETE /companies/{id}/terminals/{terminal_id}` — desativar

**Usuários (owner/manager da empresa):**
- `GET /companies/{id}/users` — listar usuários
- `POST /companies/{id}/users` — criar usuário (email, senha, role)
- `PUT /companies/{id}/users/{user_id}` — editar role, ativar/desativar
- `DELETE /companies/{id}/users/{user_id}` — desativar

## Regras de negócio
- Sempre soft delete via `active=False`
- Senha de novo usuário gerada com hash bcrypt (ORD-009)
- Owner não pode alterar o próprio role
- Manager não pode criar owners

## Stakeholder
Super admin, owner e manager. Sem esses endpoints a plataforma não é autogerenciável.
