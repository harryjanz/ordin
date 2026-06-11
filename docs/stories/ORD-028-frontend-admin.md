---
id: ORD-028
status: New
fase: 1
sprint: 4
responsavel: Frontend
---

# ORD-028 — Frontend admin panel completo conectado à API real

## Descrição
O arquivo `frontend/admin-panel-v3.tsx` é um stub vazio (~900 linhas necessárias). É necessário completar o painel administrativo com autenticação por email+senha, gestão completa de empresa (catálogo, terminais, usuários) e monitoramento de pedidos e transações.

## Contexto
O admin panel é usado pelo owner e manager da empresa para configurar e monitorar a operação. Para o super admin da plataforma, também permite gerenciar múltiplas empresas. É a interface de back-office do piloto.

## Módulos a implementar

**Autenticação:**
- Login com email + senha → `POST /auth/login`
- Refresh automático com ORD-022
- Logout com revogação de token

**Dashboard:**
- Resumo do dia: pedidos, transações, total faturado
- Status dos terminais (online/offline)

**Gestão de catálogo** (depende de ORD-023):
- Listagem de categorias e produtos
- Formulário de criação e edição
- Toggle ativo/inativo

**Gestão de empresa** (depende de ORD-024):
- Editar dados da empresa (owner)
- CRUD de terminais
- CRUD de usuários com roles

**Pedidos e transações:**
- Listagem de pedidos com filtros (status, data)
- Detalhe do pedido com tickets
- Listagem de transações TEF

**Configurações:**
- Regeneração de PIN da empresa
- Dados cadastrais

## Credenciais demo (do seed ORD-020)
- `admin@foodkiosk.com / admin123` — super admin
- `carlos@burgerhouse.com / burger123` — owner Burger House
- `maria@pastaeco.com / pasta123` — owner Pasta & Co

## Restrições técnicas
- React 18 + Vite
- Sem biblioteca de UI externa — CSS-in-JS inline
- Layout responsivo (desktop e tablet)
- Controle de acesso por role no frontend (ocultar seções conforme permissão)

## Stakeholder
Super admin, owner e manager. Sem o admin panel a operação depende de acesso direto ao banco.
