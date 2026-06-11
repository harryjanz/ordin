---
id: ORD-022
status: Done
fase: 1
sprint: 1
responsavel: Backend SR
---

# ORD-022 — Endpoint /auth/refresh com rotação de token

## História
Como usuário autenticado (admin, manager, cashier), quero poder renovar minha sessão sem precisar fazer login novamente, para que meu fluxo de trabalho não seja interrompido a cada 60 minutos quando o access token expira.

## Contexto e motivação
O auth-service emite access token (60 min) e refresh token (7 dias) no login (`POST /auth/login`), armazena o hash do refresh token no banco e tem o modelo `RefreshToken` completo — mas o endpoint `POST /auth/refresh` nunca foi implementado. Sem ele, quando o access token expira o cliente precisa pedir as credenciais novamente. Para o totem (role=kiosk), o token dura 4h e não precisa de refresh. Para os demais roles, o refresh é essencial.

A rotação é obrigatória: ao usar um refresh token, ele é revogado e um novo par (access + refresh) é emitido. Isso limita a janela de exposição se um refresh token vazar.

## Fluxo principal

1. Cliente detecta que o access token expirou (401 com `"Token expirado"`)
2. Cliente envia `POST /auth/refresh` com o refresh token atual
3. auth-service busca o hash SHA256 do refresh token no banco
4. Valida que o token existe e `revoked=False` e `expires_at > now`
5. Revoga o token atual (`revoked=True`)
6. Emite novo access token (60 min) e novo refresh token (7 dias)
7. Armazena novo refresh token no banco
8. Retorna `{ access_token, refresh_token, token_type }`

## Endpoints públicos — não exigem JWT de entrada
`POST /auth/refresh` recebe o refresh token no body, não no header Authorization.

## Dependências
- **Depende de:** ORD-001 (JWT_SECRET via env)
- **Relacionada:** ORD-002 (get_current_user — refresh é o complemento do ciclo de vida do token)

## Cenários de Teste (Gherkin)

```gherkin
Feature: ORD-022 — /auth/refresh com rotação de token

  # ─── HAPPY PATH ───────────────────────────────────────────────

  Scenario: Refresh com token válido emite novos tokens
    Dado que um usuário fez login e recebeu access_token e refresh_token
    Quando envia POST /auth/refresh com {"refresh_token": "<token_válido>"}
    Então recebe HTTP 200
    E a resposta contém novo access_token e novo refresh_token
    E ambos os tokens são diferentes dos anteriores

  Scenario: Novo access token tem o mesmo payload do original
    Dado que usuário tem company_id=1 e role=owner
    Quando renova o token via /auth/refresh
    Então o novo access token decodificado tem company_id=1 e role=owner

  Scenario: Refresh token antigo é revogado após uso
    Dado que um usuário usou o refresh_token_A para obter refresh_token_B
    Quando tenta usar refresh_token_A novamente
    Então recebe HTTP 401 com {"detail": "Token revogado ou inválido"}

  # ─── ERRO — TOKEN INVÁLIDO ────────────────────────────────────

  Scenario: Refresh com token revogado retorna 401
    Dado que o refresh_token foi revogado (logout ou uso anterior)
    Quando envia POST /auth/refresh com esse token
    Então recebe HTTP 401 com {"detail": "Token revogado ou inválido"}

  Scenario: Refresh com token expirado (> 7 dias) retorna 401
    Dado que o refresh_token tem expires_at no passado
    Quando envia POST /auth/refresh
    Então recebe HTTP 401

  Scenario: Refresh com token não encontrado no banco retorna 401
    Quando envia POST /auth/refresh com um refresh_token inventado
    Então recebe HTTP 401

  Scenario: Refresh com body vazio retorna 422
    Quando envia POST /auth/refresh sem body
    Então recebe HTTP 422

  # ─── KIOSK NÃO USA REFRESH ────────────────────────────────────

  Scenario: Token kiosk não tem refresh token associado
    Dado que totem fez login via /auth/pin-login e recebeu apenas access_token
    Quando tenta usar o access_token como refresh_token em /auth/refresh
    Então recebe HTTP 401 (tipo "refresh" não está no payload)
```

## Solução Técnica

### Endpoint `POST /auth/refresh`

```python
# services/auth/main.py — adicionar após /auth/logout

@app.post("/auth/refresh")
def refresh_token(body: RefreshReq, db: Session = Depends(get_db)):
    token_hash = hash_tok(body.refresh_token)

    stored = db.query(RefreshToken).filter_by(
        token_hash=token_hash,
        revoked=False
    ).first()

    if not stored:
        raise HTTPException(401, detail="Token revogado ou inválido")

    if stored.expires_at < datetime.utcnow():
        stored.revoked = True
        db.commit()
        raise HTTPException(401, detail="Token revogado ou inválido")

    # Validar que é um refresh token (não um access token)
    try:
        payload = jwt.decode(body.refresh_token, SECRET, algorithms=[ALGO])
        if payload.get("type") != "refresh":
            raise HTTPException(401, detail="Token revogado ou inválido")
        user_id = int(payload["sub"])
    except JWTError:
        raise HTTPException(401, detail="Token revogado ou inválido")

    # Revogar token atual
    stored.revoked = True
    db.flush()

    # Buscar dados do usuário para montar o novo access token
    # (company_id e role ficam no refresh payload — não precisa chamar company-service)
    company_id = payload.get("company")
    role       = payload.get("role", "cashier")

    new_access  = make_token(
        {"sub": str(user_id), "company": company_id, "role": role},
        timedelta(minutes=ACCESS_EX)
    )
    new_refresh = make_token(
        {"sub": str(user_id), "type": "refresh", "company": company_id, "role": role},
        timedelta(days=7)
    )

    db.add(RefreshToken(
        user_id=user_id,
        token_hash=hash_tok(new_refresh),
        expires_at=datetime.utcnow() + timedelta(days=7)
    ))
    db.commit()

    return {
        "access_token":  new_access,
        "refresh_token": new_refresh,
        "token_type":    "bearer"
    }
```

### Atualizar `POST /auth/login` — incluir `company` e `role` no refresh token

O refresh token atual não inclui `company` e `role` — precisamos adicionar para não ter que chamar o company-service no refresh:

```python
# ANTES:
refresh = make_token({"sub": str(u["id"]), "type": "refresh"}, timedelta(days=7))

# DEPOIS:
refresh = make_token(
    {"sub": str(u["id"]), "type": "refresh",
     "company": u["company_id"], "role": u["role"]},
    timedelta(days=7)
)
```

### Estimativa
- **Backend SR:** 3h (endpoint + atualizar login + testes manuais do ciclo completo)

### Riscos
- **Risco:** Refresh tokens acumulam no banco sem limpeza (tabela cresce indefinidamente)
  → **Mitigação:** aceitar para o piloto; na Fase 2 adicionar job de limpeza de tokens expirados com `DELETE WHERE expires_at < NOW() - INTERVAL 1 DAY`

## Critérios de aceite funcionais
- [ ] `POST /auth/refresh` com refresh token válido retorna novo `access_token` e `refresh_token`
- [ ] O refresh token usado é marcado como `revoked=True` no banco
- [ ] Usar o mesmo refresh token duas vezes retorna 401
- [ ] Refresh token expirado retorna 401
- [ ] `/auth/pin-login` (totem) não retorna `refresh_token` — apenas `access_token`
