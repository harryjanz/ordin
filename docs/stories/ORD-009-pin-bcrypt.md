---
id: ORD-009
status: Done
fase: 1
sprint: 2
responsavel: Backend SR
---

# ORD-009 — Hashear PIN de empresa com bcrypt

## História
Como admin de empresa, quero que o PIN do totem seja armazenado como hash bcrypt no banco, para que em caso de vazamento do banco os PINs não fiquem expostos e nenhum atacante consiga descobrir o PIN de outra empresa.

## Contexto e motivação
Vulnerabilidade A3 de `docs/ARQUITETURA.md` §12. Hoje `companies.pin` é VARCHAR(8) com o PIN em plaintext (ex: `"1234"`). Com acesso de leitura ao banco (SQL injection, backup exposto, acesso indevido), todos os PINs de todas as empresas ficam imediatamente visíveis. bcrypt com salt único por empresa garante que nem um hash comprometido expõe os demais.

**Implicação de design:** bcrypt não é reversível. O admin não consegue mais ver o PIN atual — apenas gerar um novo. O endpoint `regenerate_pin` já segue esse padrão (gera PIN novo e retorna uma única vez).

**Problema de lookup:** bcrypt usa salt aleatório, então não dá para fazer `WHERE pin_hash = hash(input)`. O fluxo de validação muda para: buscar empresa por `company_id` (para `verify_pin`) ou iterar pelas empresas ativas com `bcrypt.checkpw` (para `validate_pin`, onde só temos o PIN).

Para escala pequena (piloto com poucas empresas), a iteração é aceitável. Para produção com muitas empresas, adicionar um campo `pin_prefix` (primeiros 2 dígitos) para pré-filtrar antes do checkpw.

## Dependências
- **Depende de:** ORD-006 (Alembic — adicionar `pin_hash` e remover `pin` via migration)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-009 — PIN hasheado com bcrypt

  # ─── VALIDAÇÃO DE PIN ─────────────────────────────────────────

  Scenario: validate-pin aceita PIN correto
    Dado que Burger House tem PIN "1234" armazenado como hash bcrypt
    Quando envio POST /internal/validate-pin com {"pin": "1234"}
    Então recebo HTTP 200 com company.id=1

  Scenario: validate-pin rejeita PIN errado
    Quando envio POST /internal/validate-pin com {"pin": "9999"} (PIN errado para Burger House)
    Então recebo HTTP 401

  Scenario: verify-pin aceita PIN + terminal correto
    Quando envio POST /internal/verify-pin com {"pin": "1234", "terminal_id": 1}
    Então recebo HTTP 200 com company e terminal

  # ─── BANCO NÃO EXPÕE PIN ──────────────────────────────────────

  Scenario: PIN plaintext não existe mais no banco
    Dado que a migration ORD-009 foi aplicada
    Quando consulto diretamente a tabela companies
    Então a coluna pin não existe (ou é NULL/removida)
    E a coluna pin_hash contém um valor iniciando com $2b$

  # ─── REGENERAÇÃO DE PIN ───────────────────────────────────────

  Scenario: regenerate-pin armazena hash e retorna plaintext uma vez
    Dado que admin autenticado chama POST /companies/1/regenerate-pin
    Então recebo o novo PIN numérico em plaintext na resposta
    E no banco companies.pin_hash é atualizado com bcrypt do novo PIN
    E a resposta não inclui pin_hash

  Scenario: PIN antigo é inválido após regeneração
    Dado que o PIN atual é "1234"
    Quando chamo regenerate-pin e obtenho novo PIN "654321"
    Então validate-pin com "1234" retorna 401
    E validate-pin com "654321" retorna 200

  # ─── SEED ATUALIZADO ──────────────────────────────────────────

  Scenario: docker compose up com seed bcrypt funciona
    Dado que a migration de seed usa hashes bcrypt reais
    Quando envio POST /auth/validate-pin com {"pin": "1234"}
    Então recebo HTTP 200 (Burger House)
```

## Solução Técnica

### Migration 003 — adicionar pin_hash, migrar dados, remover pin

```python
# services/company/migrations/versions/20260611_XXXX_pin_bcrypt.py
import bcrypt

def upgrade():
    # 1. Adiciona coluna nova
    op.add_column("companies", sa.Column("pin_hash", sa.String(128), nullable=True))

    # 2. Migra dados existentes
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, pin FROM companies")).fetchall()
    for row in rows:
        pin_hash = bcrypt.hashpw(str(row.pin).encode(), bcrypt.gensalt(12)).decode()
        conn.execute(
            sa.text("UPDATE companies SET pin_hash = :h WHERE id = :id"),
            {"h": pin_hash, "id": row.id}
        )

    # 3. Torna obrigatória e remove coluna antiga
    op.alter_column("companies", "pin_hash", nullable=False)
    op.drop_column("companies", "pin")

def downgrade():
    op.add_column("companies", sa.Column("pin", sa.String(8), nullable=True))
    op.drop_column("companies", "pin_hash")
```

### Modelo Company — atualizar coluna

```python
class Company(Base):
    # ANTES:
    # pin = Column(String(8))

    # DEPOIS:
    pin_hash = Column(String(128), nullable=False)
```

### validate_pin — busca por ativo + checkpw

```python
@app.post("/internal/validate-pin")
def validate_pin(body: dict, db: Session = Depends(get_db), _: None = Depends(require_internal)):
    companies = db.query(Company).filter_by(active=True).all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401, "PIN inválido")
    return {"company": {"id": co.id, "name": co.name, "plan": co.plan}}
```

### verify_pin — busca company por pin (mesmo padrão)

```python
@app.post("/internal/verify-pin")
def verify_pin(body: dict, db: Session = Depends(get_db), _: None = Depends(require_internal)):
    companies = db.query(Company).filter_by(active=True).all()
    co = next((c for c in companies if bcrypt.checkpw(body["pin"].encode(), c.pin_hash.encode())), None)
    if not co: raise HTTPException(401, "PIN inválido")
    t = db.query(Terminal).filter_by(id=body["terminal_id"], company_id=co.id, active=True).first()
    if not t: raise HTTPException(404, "Terminal não encontrado")
    return {"company": {"id": co.id, "name": co.name, "plan": co.plan},
            "terminal": {"id": t.id, "label": t.label, "tef_number": t.tef_number}}
```

### regenerate_pin — hashear antes de salvar

```python
@app.post("/companies/{company_id}/regenerate-pin")
def regenerate_pin(company_id: int, db: Session = Depends(get_db),
                   current_user: TokenPayload = Depends(get_current_user)):
    if current_user.company_id != company_id and current_user.role not in ("superadmin",):
        raise HTTPException(403, "Acesso negado")
    co = db.get(Company, company_id)
    if not co: raise HTTPException(404)
    new_pin = str(secrets.randbelow(900000) + 100000)
    co.pin_hash = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt(12)).decode()
    db.commit()
    return {"pin": new_pin}  # exibido uma única vez
```

### Seed atualizado (migration 002 do company-service)

Após esta história, a migration 002 de seed deve usar `pin_hash` em vez de `pin`:

```python
# Hash pré-computado de "1234" (rounds=12)
op.execute("""
    INSERT IGNORE INTO companies (id,name,document,pin_hash,plan,active) VALUES
    (1,'Burger House','12.345.678/0001-99','$2b$12$HASH_1234','pro',1),
    ...
""")
```

Os hashes devem ser gerados e atualizados após implementar esta história.

### Estimativa
- **Backend SR:** 4h (migration + modelo + 3 endpoints + seed atualizado)

### Riscos
- **Médio:** `bcrypt.checkpw` em N empresas é O(N). Para piloto (3–10 empresas), latência desprezível. Para 1000+ empresas, adicionar `pin_prefix` para pré-filtrar.
  → **Mitigação:** aceitar para o piloto; documentar a limitação no código.
- **Baixo:** Migration de dados em banco com PIN existente pode falhar se `pin` tiver valor NULL
  → **Mitigação:** filtrar `WHERE pin IS NOT NULL` na migration.

## Critérios de aceite funcionais
- [x] `companies.pin` não existe mais no schema após migration
- [x] `companies.pin_hash` contém hash bcrypt válido (`$2b$12$...`)
- [x] `POST /auth/validate-pin` com PIN correto retorna 200
- [x] `POST /auth/pin-login` com PIN correto retorna access token
- [x] `POST /companies/{id}/regenerate-pin` retorna novo PIN em plaintext e atualiza hash no banco
- [x] PIN incorreto retorna 401 em validate-pin e pin-login
