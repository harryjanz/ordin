"""
Testes de cobertura para order service.
Usa chamadas diretas às funções endpoint para cobrir linhas pós-`await`.
Testa também qr_generator.py e websocket.py.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import HTTPException
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _user(role="owner", company_id=1, terminal_id=None):
    from auth import TokenPayload
    return TokenPayload(sub="1", company_id=company_id, role=role, terminal_id=terminal_id)


@pytest.fixture
async def db_session():
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    yield test_session
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


async def _create_order(SessionLocal, company_id=1, terminal_id=1):
    await _cleanup_order(SessionLocal)  # pre-clean to avoid duplicate key
    import main as svc
    async with SessionLocal() as db:
        order = svc.Order(company_id=company_id, terminal_id=terminal_id,
                          order_ref="ORD-COV01", total=25.90, discount=0.0)
        db.add(order); await db.flush()
        oi = svc.OrderItem(order_id=order.id, product_id=1, product_name="X-Burger",
                           unit_price=25.90, quantity=1, subtotal=25.90)
        db.add(oi); await db.flush()
        qr_data = "TICK0001|X-Burger|ORD-COV01|2024-01-01T00:00:00|" + "a"*64
        t = svc.Ticket(order_item_id=oi.id, ticket_code="TICK0001",
                       qr_data=qr_data, order_ref="ORD-COV01",
                       unit_number=1, total_units=1)
        db.add(t); await db.commit()
        return order.id, oi.id, t.id


async def _cleanup_order(SessionLocal, order_ref="ORD-COV01"):
    import main as svc
    from sqlalchemy import select as sa_select
    async with SessionLocal() as db:
        order_ids = (await db.execute(
            sa_select(svc.Order.id).where(svc.Order.order_ref == order_ref)
        )).scalars().all()
        if order_ids:
            oi_ids = (await db.execute(
                sa_select(svc.OrderItem.id).where(svc.OrderItem.order_id.in_(order_ids))
            )).scalars().all()
            if oi_ids:
                await db.execute(sa_delete(svc.Ticket).where(svc.Ticket.order_item_id.in_(oi_ids)))
            await db.execute(sa_delete(svc.OrderItem).where(svc.OrderItem.order_id.in_(order_ids)))
            await db.execute(sa_delete(svc.Order).where(svc.Order.order_ref == order_ref))
        await db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# qr_generator.py — 0% → 100%
# ═══════════════════════════════════════════════════════════════════════════════

def test_build_qr_data():
    from qr_generator import build_qr_data
    result = build_qr_data("TICKET-001", "ORD-001")
    data = json.loads(result)
    assert data["id"] == "TICKET-001"
    assert data["ref"] == "ORD-001"
    assert "sig" in data


def test_verify_qr_data_valido():
    from qr_generator import build_qr_data, verify_qr_data
    qr = build_qr_data("T001", "ORD-001")
    result = verify_qr_data(qr)
    assert result is not None
    assert result["ticket_code"] == "T001"
    assert result["order_ref"] == "ORD-001"


def test_verify_qr_data_assinatura_invalida():
    from qr_generator import verify_qr_data
    data = {"v": 1, "id": "T001", "ref": "ORD-001", "ts": "2024-01-01", "sig": "INVALIDA"}
    result = verify_qr_data(json.dumps(data))
    assert result is None


def test_verify_qr_data_json_invalido():
    from qr_generator import verify_qr_data
    result = verify_qr_data("not-valid-json")
    assert result is None


def test_generate_qr_png_b64():
    import base64

    from qr_generator import build_qr_data, generate_qr_png_b64
    qr = build_qr_data("T001", "ORD-001")
    result = generate_qr_png_b64(qr)
    assert isinstance(result, str)
    decoded = base64.b64decode(result)
    assert decoded[:4] == b'\x89PNG'


def test_generate_qr_svg():
    from qr_generator import build_qr_data, generate_qr_svg
    qr = build_qr_data("T001", "ORD-001")
    result = generate_qr_svg(qr)
    assert isinstance(result, str)
    assert "<svg" in result.lower() or "svg" in result.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# websocket.py — ConnectionManager e broadcast helpers
# ═══════════════════════════════════════════════════════════════════════════════

async def test_connection_manager_connect_broadcast_disconnect():
    from unittest.mock import AsyncMock

    from websocket import ConnectionManager
    mgr = ConnectionManager()
    ws = AsyncMock()
    await mgr.connect(ws, 1)
    ws.accept.assert_called_once()
    await mgr.broadcast(1, {"event": "test"})
    ws.send_text.assert_called_once()
    mgr.disconnect(ws, 1)


async def test_connection_manager_broadcast_sem_conexoes():
    from websocket import ConnectionManager
    mgr = ConnectionManager()
    await mgr.broadcast(99, {"event": "test"})  # sem conexão → sem erro


async def test_connection_manager_broadcast_ws_morto():
    """Quando ws.send_text levanta exceção, deve remover a conexão morta."""
    from unittest.mock import AsyncMock

    from websocket import ConnectionManager
    mgr = ConnectionManager()
    ws = AsyncMock()
    ws.send_text.side_effect = Exception("conexão fechada")
    await mgr.connect(ws, 2)
    await mgr.broadcast(2, {"event": "test"})
    assert ws not in mgr._conns.get(2, [])


async def test_broadcast_ticket_collected():
    from unittest.mock import AsyncMock, patch

    from websocket import broadcast_ticket_collected, manager
    with patch.object(manager, 'broadcast', new_callable=AsyncMock) as mock_broadcast:
        await broadcast_ticket_collected(1, "T001", "ORD-001", "X-Burger", "1/1", "operador")
    mock_broadcast.assert_called_once()
    args = mock_broadcast.call_args[0]
    assert args[0] == 1
    assert args[1]["event"] == "ticket.collected"


async def test_broadcast_order_completed():
    from unittest.mock import AsyncMock, patch

    from websocket import broadcast_order_completed, manager
    with patch.object(manager, 'broadcast', new_callable=AsyncMock) as mock_broadcast:
        await broadcast_order_completed(1, "ORD-001")
    mock_broadcast.assert_called_once()
    assert mock_broadcast.call_args[0][1]["event"] == "order.completed"


async def test_broadcast_order_created():
    from unittest.mock import AsyncMock, patch

    from websocket import broadcast_order_created, manager
    with patch.object(manager, 'broadcast', new_callable=AsyncMock) as mock_broadcast:
        await broadcast_order_created(1, "ORD-001", 25.90, "Terminal 1")
    mock_broadcast.assert_called_once()
    assert mock_broadcast.call_args[0][1]["event"] == "order.created"


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — helpers síncronos
# ═══════════════════════════════════════════════════════════════════════════════

def test_require_internal_secret_invalido():
    import main as svc
    with pytest.raises(HTTPException) as exc:
        svc.require_internal("errado")
    assert exc.value.status_code == 403


def test_verify_qr_invalido():
    import main as svc
    assert svc._verify_qr("partes|insuficientes") is False


def test_verify_qr_valido():
    import hashlib
    import hmac as hmaclib

    import main as svc
    parts = ["TICK0001", "X-Burger", "ORD-001", "2024-01-01"]
    payload = "|".join(parts)
    sig = hmaclib.new(svc.QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    qr = payload + "|" + sig
    assert svc._verify_qr(qr) is True


# ═══════════════════════════════════════════════════════════════════════════════
# main.py — chamadas diretas (cobre linhas pós-`await`)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_dir_create_order(db_session):
    import main as svc
    from main import ItemIn, OrderIn
    body = OrderIn(items=[ItemIn(product_id=1, name="X-Burger", qty=2, unit_price=25.90)])
    result = await svc.create_order(body, db_session(), _user("kiosk", 1, terminal_id=1))
    assert "order_ref" in result
    ref = result["order_ref"]
    async with db_session() as db:
        await db.execute(sa_delete(svc.Ticket).where(svc.Ticket.order_ref == ref))
        from sqlalchemy import select as sa_select
        ois = (await db.execute(
            sa_select(svc.OrderItem).join(svc.Order, svc.Order.id == svc.OrderItem.order_id)
            .where(svc.Order.order_ref == ref)
        )).scalars().all()
        for oi in ois:
            await db.execute(sa_delete(svc.OrderItem).where(svc.OrderItem.id == oi.id))
        await db.execute(sa_delete(svc.Order).where(svc.Order.order_ref == ref))
        await db.commit()


async def test_dir_list_orders(db_session):
    import main as svc
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    async with db_session() as db:
        result = await svc.list_orders(db=db, current_user=_user("owner", 1))
    assert "orders" in result
    assert "summary" in result
    await _cleanup_order(db_session)


async def test_dir_list_orders_com_status(db_session):
    import main as svc
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    async with db_session() as db:
        result = await svc.list_orders(status="pending", db=db, current_user=_user("owner", 1))
    assert "orders" in result
    await _cleanup_order(db_session)


async def _mk_bare_order(SessionLocal, order_ref, company_id=1, status="pending",
                          cpf=None, created_at=None, total=10.0):
    """Pedido sem itens/tickets — suficiente pros filtros de list_orders,
    que não dependem de OrderItem/Ticket. Pre-limpa o mesmo order_ref
    primeiro (idempotente em retry, mesmo padrão de _create_order)."""
    await _cleanup_orders(SessionLocal, [order_ref])
    import main as svc
    async with SessionLocal() as db:
        order = svc.Order(company_id=company_id, terminal_id=1, order_ref=order_ref,
                          total=total, discount=0.0, status=status, cpf=cpf)
        if created_at is not None:
            order.created_at = created_at
        db.add(order)
        await db.commit()


async def _cleanup_orders(SessionLocal, order_refs):
    import main as svc
    from sqlalchemy import select as sa_select
    async with SessionLocal() as db:
        ids = (await db.execute(
            sa_select(svc.Order.id).where(svc.Order.order_ref.in_(order_refs))
        )).scalars().all()
        if ids:
            await db.execute(sa_delete(svc.Order).where(svc.Order.id.in_(ids)))
            await db.commit()


async def test_dir_list_orders_filtro_referencia(db_session):
    """ORD-081: busca parcial por order_ref."""
    import main as svc
    refs = ["ORD-COVREF01", "ORD-COVREF02", "ORD-OUTRO01"]
    for r in refs:
        await _mk_bare_order(db_session, r)
    async with db_session() as db:
        result = await svc.list_orders(order_ref="COVREF", db=db, current_user=_user("owner", 1))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVREF01", "ORD-COVREF02"}
    await _cleanup_orders(db_session, refs)



# company_id=999 (inexistente no seed) pros testes abaixo que fazem
# asserção de igualdade exata — a empresa 1 do seed já tem 85 pedidos reais
# (23 pending, 54 paid, 8 cancelled) que poluiriam qualquer comparação
# exata de CPF/status/período/horário se usássemos company_id=1.
ISOLATED_CO = 999


async def test_dir_list_orders_filtro_cpf(db_session):
    """ORD-081: filtro por CPF, normalizado (aceita com ou sem pontuação)."""
    import main as svc
    refs = ["ORD-COVCPF01", "ORD-COVCPF02"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, cpf="99988877766")
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, cpf="11122233344")
    async with db_session() as db:
        result = await svc.list_orders(cpf="999.888.777-66", db=db, current_user=_user("owner", ISOLATED_CO))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVCPF01"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_filtro_cpf_prefixo(db_session):
    """Achado ao vivo: usuário reportou que lembrar só os primeiros dígitos
    de um CPF ("030") não achava nada com igualdade exata — vira busca por
    prefixo, não igualdade."""
    import main as svc
    refs = ["ORD-COVCPFP1", "ORD-COVCPFP2"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, cpf="03013954973")
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, cpf="11122233344")
    async with db_session() as db:
        result = await svc.list_orders(cpf="030", db=db, current_user=_user("owner", ISOLATED_CO))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVCPFP1"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_filtro_status_paid(db_session):
    """Achado crítico do ORD-081: status 'paid' precisa ser filtrável (faltava no frontend antigo)."""
    import main as svc
    refs = ["ORD-COVPAID1", "ORD-COVPEND1"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, status="paid")
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, status="pending")
    async with db_session() as db:
        result = await svc.list_orders(status="paid", db=db, current_user=_user("owner", ISOLATED_CO))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVPAID1"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_periodo(db_session):
    from datetime import datetime

    import main as svc
    refs = ["ORD-COVPER01", "ORD-COVPER02"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 1, 10, 0))
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 10, 10, 0))
    async with db_session() as db:
        result = await svc.list_orders(
            date_from="2026-08-05", date_to="2026-08-15", db=db, current_user=_user("owner", ISOLATED_CO)
        )
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVPER02"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_faixa_horario_com_data(db_session):
    """Faixa de horário aplica sobre o período, em qualquer dia dele — caso
    de uso: cliente sem o número do pedido, lembra o horário aproximado."""
    from datetime import datetime

    import main as svc
    refs = ["ORD-COVHOR01", "ORD-COVHOR02", "ORD-COVHOR03"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 1, 12, 0))
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 5, 12, 30))
    await _mk_bare_order(db_session, refs[2], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 1, 20, 0))
    async with db_session() as db:
        result = await svc.list_orders(
            date_from="2026-08-01", date_to="2026-08-10",
            hour_from="11:00", hour_to="14:00",
            db=db, current_user=_user("owner", ISOLATED_CO),
        )
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVHOR01", "ORD-COVHOR02"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_faixa_horario_ignorada_sem_data_from(db_session):
    """hour_from/hour_to só têm efeito com date_from setado (mesma trava do
    frontend, campo desabilitado até "De" ser preenchido)."""
    from datetime import datetime

    import main as svc
    refs = ["ORD-COVHORX1", "ORD-COVHORX2"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 1, 12, 0))
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, created_at=datetime(2026, 8, 1, 20, 0))
    async with db_session() as db:
        result = await svc.list_orders(
            hour_from="11:00", hour_to="14:00", db=db, current_user=_user("owner", ISOLATED_CO),
        )
    found = {o["order_ref"] for o in result["orders"]}
    assert refs[0] in found and refs[1] in found
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_superadmin_ve_todas_empresas(db_session):
    import main as svc
    refs = ["ORD-COVSA01", "ORD-COVSA02"]
    await _mk_bare_order(db_session, refs[0], company_id=1)
    await _mk_bare_order(db_session, refs[1], company_id=2)
    async with db_session() as db:
        result = await svc.list_orders(db=db, current_user=_user("superadmin", 1))
    found = {o["order_ref"] for o in result["orders"]}
    assert refs[0] in found and refs[1] in found
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_admin_filtra_por_empresa(db_session):
    import main as svc
    refs = ["ORD-COVAD01", "ORD-COVAD02"]
    await _mk_bare_order(db_session, refs[0], company_id=1)
    await _mk_bare_order(db_session, refs[1], company_id=2)
    async with db_session() as db:
        result = await svc.list_orders(company_id=2, db=db, current_user=_user("admin", 1))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVAD02"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_owner_ignora_company_id_de_outra_empresa(db_session):
    """Owner não escapa da própria empresa nem manipulando company_id na
    query — parâmetro é ignorado pra quem não é superadmin/admin. Usa
    company_id isolados dos dois lados (nem a própria empresa do owner pode
    ter dado real de seed, senão a asserção de igualdade exata quebra)."""
    import main as svc
    refs = ["ORD-COVOW01", "ORD-COVOW02"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO)
    await _mk_bare_order(db_session, refs[1], company_id=2)
    async with db_session() as db:
        result = await svc.list_orders(company_id=2, db=db, current_user=_user("owner", ISOLATED_CO))
    found = {o["order_ref"] for o in result["orders"]}
    assert found == {"ORD-COVOW01"}
    await _cleanup_orders(db_session, refs)


async def test_dir_list_orders_summary_ignora_filtro_de_status(db_session):
    """Resumo por status sempre mostra a distribuição completa (empresa/
    período/etc.), mesmo com a tabela filtrada por um status só — mesmo
    padrão do ORD-078 em list_payments."""
    import main as svc
    refs = ["ORD-COVSUM01", "ORD-COVSUM02", "ORD-COVSUM03"]
    await _mk_bare_order(db_session, refs[0], company_id=ISOLATED_CO, status="pending", total=10.0)
    await _mk_bare_order(db_session, refs[1], company_id=ISOLATED_CO, status="paid", total=20.0)
    await _mk_bare_order(db_session, refs[2], company_id=ISOLATED_CO, status="paid", total=30.0)
    async with db_session() as db:
        result = await svc.list_orders(status="pending", db=db, current_user=_user("owner", ISOLATED_CO))
    assert len(result["orders"]) == 1
    assert result["summary"]["pending"]["count"] == 1
    assert result["summary"]["paid"]["count"] == 2
    assert result["summary"]["paid"]["total"] == 50.0
    await _cleanup_orders(db_session, refs)


async def test_dir_update_status(db_session):
    import main as svc
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    async with db_session() as db:
        result = await svc.update_status("ORD-COV01", {"status": "cancelled"},
                                          db, _user("owner", 1))
    assert result["status"] == "cancelled"
    await _cleanup_order(db_session)


async def test_dir_update_status_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.update_status("ORD-NAOEXISTE", {"status": "cancelled"}, db, _user("owner", 1))
        assert exc.value.status_code == 404


async def test_dir_list_order_tickets(db_session):
    import main as svc
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    async with db_session() as db:
        result = await svc.list_order_tickets("ORD-COV01", db, _user("owner", 1))
    assert "tickets" in result
    await _cleanup_order(db_session)


async def test_dir_list_order_tickets_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.list_order_tickets("ORD-NAOEXISTE", db, _user("owner", 1))
        assert exc.value.status_code == 404


async def test_dir_internal_update_status(db_session):
    import main as svc
    _order_id, _oi_id, _t_id = await _create_order(db_session, company_id=1)
    async with db_session() as db:
        result = await svc.internal_update_status("ORD-COV01", {"status": "paid"}, db, None)
    assert result["status"] == "paid"
    await _cleanup_order(db_session)


async def test_dir_internal_update_status_inexistente(db_session):
    import main as svc
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.internal_update_status("ORD-NAOEXISTE", {"status": "paid"}, db, None)
        assert exc.value.status_code == 404


async def test_dir_collect_ticket_inexistente(db_session):
    import main as svc
    from main import CollectIn
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.collect_ticket("NAOEXISTE", CollectIn(collected_by="op"),
                                     db, _user("cashier", 1), x_device_id=None)
        assert exc.value.status_code == 404


async def test_dir_collect_ticket_qr_invalido(db_session):
    import main as svc
    from main import CollectIn
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    async with db_session() as db:
        with pytest.raises(HTTPException) as exc:
            await svc.collect_ticket(
                "TICK0001",
                CollectIn(collected_by="op", qr_data="dado|invalido|sem|hmac|valido"),
                db, _user("cashier", 1), x_device_id=None)
        assert exc.value.status_code == 400
    await _cleanup_order(db_session)


async def test_dir_collect_ticket_valido(db_session):
    import hashlib
    import hmac as hmaclib

    import main as svc
    from main import CollectIn
    _order_id, _oi_id, _t_id = await _create_order(db_session)
    parts = ["TICK0001", "X-Burger", "ORD-COV01", "2024-01-01T00:00:00"]
    payload = "|".join(parts)
    sig = hmaclib.new(svc.QR_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    valid_qr = payload + "|" + sig
    async with db_session() as db:
        result = await svc.collect_ticket(
            "TICK0001",
            CollectIn(collected_by="operador", qr_data=valid_qr),
            db, _user("cashier", 1), x_device_id=None)
    assert result["ok"] is True
    assert result["ticket_code"] == "TICK0001"
    await _cleanup_order(db_session)
