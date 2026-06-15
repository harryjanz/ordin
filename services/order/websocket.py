# services/order/websocket.py
# ConnectionManager agrupado por company_id
# Eventos: ticket.collected | order.completed | order.created
# URL: ws://host:8004/ws/orders?company_id=1

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, List
import asyncio, json, logging

logger = logging.getLogger("ws")
ws_router = APIRouter()

class ConnectionManager:
    def __init__(self): self._conns: Dict[int,List[WebSocket]] = {}

    async def connect(self, ws: WebSocket, cid: int):
        await ws.accept()
        self._conns.setdefault(cid,[]).append(ws)
        logger.info(f"WS connect: company={cid} total={len(self._conns[cid])}")

    def disconnect(self, ws: WebSocket, cid: int):
        conns = self._conns.get(cid,[])
        if ws in conns: conns.remove(ws)

    async def broadcast(self, cid: int, event: dict):
        payload = json.dumps(event, ensure_ascii=False, default=str)
        dead = []
        for ws in list(self._conns.get(cid,[])):
            try: await ws.send_text(payload)
            except: dead.append(ws)
        for ws in dead: self.disconnect(ws, cid)

manager = ConnectionManager()

async def broadcast_ticket_collected(company_id,ticket_code,order_ref,product_name,progress,collected_by):
    await manager.broadcast(company_id,{"event":"ticket.collected","ticket_code":ticket_code,
        "order_ref":order_ref,"product_name":product_name,"progress":progress,"collected_by":collected_by})

async def broadcast_order_completed(company_id, order_ref):
    await manager.broadcast(company_id,{"event":"order.completed","order_ref":order_ref})

async def broadcast_order_created(company_id, order_ref, total, terminal_label):
    await manager.broadcast(company_id,{"event":"order.created","order_ref":order_ref,
        "total":total,"terminal_label":terminal_label})

async def broadcast_order_paid(company_id: int, order_ref: str, total: float, terminal_id: int):
    await manager.broadcast(company_id,{"event":"order.paid","order_ref":order_ref,
        "total":total,"terminal_id":terminal_id})

@ws_router.websocket("/ws/orders")
async def ws_orders(ws: WebSocket, company_id: int = Query(...)):
    await manager.connect(ws, company_id)
    await ws.send_text(json.dumps({"event":"connected","company_id":company_id}))
    try:
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=30)
                msg  = json.loads(data)
                if msg.get("type") == "ping":
                    await ws.send_text(json.dumps({"type":"pong"}))
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type":"heartbeat"}))
    except WebSocketDisconnect:
        manager.disconnect(ws, company_id)