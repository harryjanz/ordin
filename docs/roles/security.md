# Papel: Analista de Cibersegurança

## Responsabilidades no Ordin

- Identificar, priorizar e acompanhar a remediação de vulnerabilidades
- Revisar PRs com foco em autenticação, autorização, injection e exposição de dados
- Definir e manter os requisitos mínimos de segurança para produção
- Propor e revisar o modelo RBAC nos endpoints
- Garantir que credenciais nunca entram no código ou no histórico git

## Registro de vulnerabilidades

### Críticas (bloquear deploy em produção)

| ID | Vulnerabilidade | Arquivo/Linha | Remediação |
|---|---|---|---|
| C1 | Senhas de banco hardcoded | `init.sql` (todo) | Mover para Secrets Manager; `init.sql` usa `${VAR}` |
| C2 | Connection strings com senha no código | `services/*/main.py` ~L15 | `DB_URL` via env var injetada pelo ECS via SM |
| C3 | `JWT_SECRET = "dev-secret"` como fallback | `services/auth/main.py:61` | Remover fallback; falhar no startup se ausente |
| C4 | Endpoints de negócio sem validação de JWT | `order`, `catalog`, `payment` | Dependency `get_current_user` em todas as rotas |
| C5 | `/internal/*` acessíveis sem auth via gateway | `nginx.conf` + company | Bloquear `/internal/` no nginx; header `X-Internal-Secret` entre serviços |

### Altas (corrigir antes do primeiro deploy staging)

| ID | Vulnerabilidade | Arquivo/Linha | Remediação |
|---|---|---|---|
| A1 | CORS `allow_origins=["*"]` nos serviços | `services/*/main.py` | Restringir para origens conhecidas via env var |
| A2 | CORS wildcard no nginx | `nginx.conf:13-15` | Remover headers globais; gerenciar no ALB por path |
| A3 | Sem HTTPS | `nginx.conf` | TLS no ALB (ACM); serviços internos mantêm HTTP dentro da VPC |
| A4 | Sem validação de `company_id` no contexto do JWT | `order`, `payment` | Extrair `company_id` do JWT, não aceitar do body |
| A5 | PIN de empresa em plaintext | `companies.pin` | Hash bcrypt do PIN; comparação via `bcrypt.checkpw` |

### Médias (corrigir antes da versão 1.0)

| ID | Vulnerabilidade | Arquivo/Linha | Remediação |
|---|---|---|---|
| M1 | RabbitMQ com guest/guest exposto | `docker-compose.yml` | Credenciais via SM; portas não expostas externamente na AWS |
| M2 | QR code sem assinatura | `order/main.py:102` | HMAC-SHA256 com chave secreta; validar no collect |
| M3 | Sem auditoria de ações sensíveis | todos | Tabela `audit_log` ou CloudWatch structured logs |
| M4 | `collected_by` sem validação | `order/main.py` | Extrair do JWT, não aceitar do body |

## Modelo RBAC

Roles presentes no payload JWT (campo `role`):

| Role | Escopo no JWT | O que pode fazer |
|---|---|---|
| `kiosk` | `company_id` + `terminal_id` | Ler catálogo, criar pedido e pagamento para **sua empresa** |
| `cashier` | `company_id` | Coletar tickets, ver pedidos de **sua empresa** |
| `admin` | `company_id` | CRUD completo dos recursos de **sua empresa** |
| `super_admin` | — (plataforma) | Acesso irrestrito |

**Regra de isolamento:** todo endpoint que recebe ou retorna dados de uma empresa DEVE extrair `company_id` do token JWT e ignorar qualquer `company_id` enviado no body/query.

## Requisitos mínimos para deploy em produção

- [ ] Zero credenciais hardcoded (C1, C2, C3 resolvidos)
- [ ] JWT validado em 100% dos endpoints de negócio (C4 resolvido)
- [ ] `/internal/*` bloqueado externamente (C5 resolvido)
- [ ] HTTPS habilitado no ALB (A3 resolvido)
- [ ] `company_id` extraído sempre do JWT (A4 resolvido)
- [ ] CORS restrito a origens conhecidas (A1, A2 resolvidos)
- [ ] PIN hashado no banco (A5 resolvido)

## Slash command

Use `/security <tarefa>` para acionar o Claude no papel de Security.
Exemplos:
- `/security analisar o auth-service e listar todas as vulnerabilidades com severidade`
- `/security implementar a validação de JWT como dependency FastAPI reutilizável`
- `/security revisar o PR de refatoração do order-service`
