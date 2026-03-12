# services/order/main.py
# SELECT FOR UPDATE — sem dupla baixa em multi-device
# Rastreabilidade: collected_by, collected_at, collection_device
# Finalização atômica do pedido no backend

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session, relationship
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import random, string, os

DB_URL = f"mysql+pymysql://fk_order:order_pass@{os.getenv('DB_HOST','mysql')}:3306/fk_order?charset=utf8mb4"
engine = create_engine(DB_URL, pool_pre_ping=True)

class Base(DeclarativeBase): pass

class Order(Base):
    __tablename__ = "orders"
    id          = Column(Integer, primary_key=True)
    company_id  = Column(Integer, nullable=False, index=True)
    terminal_id = Column(Integer, nullable=False)
    order_ref   = Column(String(12), unique=True, nullable=False)
    status      = Column(String(20), default="pending")
    total       = Column(Numeric(10,2), nullable=False)
    discount    = Column(Numeric(10,2), default=0)
    cpf         = Column(String(14))
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, onupdate=datetime.utcnow)
    items       = relationship("OrderItem", back_populates="order", cascade="all, delete")

class OrderItem(Base):
    __tablename__ = "order_items"
    id           = Column(Integer, primary_key=True)
    order_id     = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id   = Column(Integer, nullable=False)
    product_name = Column(String(120), nullable=False)
    unit_price   = Column(Numeric(10,2), nullable=False)
    quantity     = Column(Integer, nullable=False, default=1)
    subtotal     = Column(Numeric(10,2), nullable=False)
    order        = relationship("Order", back_populates="items")
    tickets      = relationship("Ticket", back_populates="item", cascade="all, delete")

class Ticket(Base):
    __tablename__ = "tickets"
    id                = Column(Integer, primary_key=True)
    order_item_id     = Column(Integer, ForeignKey("order_items.id"), nullable=False)
    ticket_code       = Column(String(12), unique=True, nullable=False)
    qr_data           = Column(String(500), nullable=False)
    order_ref         = Column(String(12), nullable=False, index=True)
    unit_number       = Column(Integer, nullable=False)
    total_units       = Column(Integer, nullable=False)
    status            = Column(String(20), default="printed")
    printed_at        = Column(DateTime, default=datetime.utcnow)
    collected_at      = Column(DateTime, nullable=True)
    collected_by      = Column(String(80), nullable=True)
    collection_device = Column(String(64), nullable=True)
    item              = relationship("OrderItem", back_populates="tickets")

Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

app = FastAPI(title="Order Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ItemIn(BaseModel):
    product_id: int; name: str; qty: int; unit_price: float

class OrderIn(BaseModel):
    company_id: int; terminal_id: int; items: List[ItemIn]
    cpf: Optional[str] = None; discount: float = 0

class CollectIn(BaseModel):
    collected_by: Optional[str] = "balcao"
    collection_device: Optional[str] = None

def _gen_ref(): return "P"+"".join(random.choices(string.digits,k=6))
def _gen_code():
    chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars,k=8))

@app.post("/orders", status_code=201)
def create_order(body: OrderIn, db: Session = Depends(get_db)):
    ref   = _gen_ref()
    total = sum(i.unit_price*i.qty for i in body.items) - body.discount
    order = Order(company_id=body.company_id, terminal_id=body.terminal_id,
                  order_ref=ref, total=total, discount=body.discount, cpf=body.cpf)
    db.add(order); db.flush()
    for item in body.items:
        oi = OrderItem(order_id=order.id, product_id=item.product_id,
                       product_name=item.name, unit_price=item.unit_price,
                       quantity=item.qty, subtotal=item.unit_price*item.qty)
        db.add(oi); db.flush()
        for u in range(1, item.qty+1):
            code = _gen_code()
            qr   = f"{code}|{item.name}|{ref}|{datetime.utcnow().isoformat()}"
            db.add(Ticket(order_item_id=oi.id, ticket_code=code, qr_data=qr,
                          order_ref=ref, unit_number=u, total_units=item.qty))
    db.commit(); db.refresh(order)
    return {"order_ref":order.order_ref,"total":float(order.total),"status":order.status}

@app.post("/tickets/{ticket_code}/collect")
def collect_ticket(
    ticket_code: str, body: CollectIn,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(default=None)
):
    ticket = (db.query(Ticket).filter(Ticket.ticket_code==ticket_code)
              .with_for_update().first())  # SELECT FOR UPDATE
    if not ticket:  raise HTTPException(404, "Ticket não encontrado")
    if ticket.status=="collected": raise HTTPException(409, "Ticket já coletado")
    if ticket.status=="expired":  raise HTTPException(410, "Ticket expirado")
    ticket.status            = "collected"
    ticket.collected_at      = datetime.utcnow()
    ticket.collected_by      = body.collected_by
    ticket.collection_device = x_device_id or body.collection_device
    db.flush()
    total_t     = db.query(Ticket).filter_by(order_ref=ticket.order_ref).count()
    collected_t = db.query(Ticket).filter_by(order_ref=ticket.order_ref,status="collected").count()
    order_done  = False
    if collected_t == total_t:
        order = (db.query(Order).filter_by(order_ref=ticket.order_ref)
                 .with_for_update().first())
        if order and order.status != "completed":
            order.status = "completed"; order_done = True
    db.commit()
    return {"ok":True,"ticket_code":ticket_code,"order_ref":ticket.order_ref,
            "collected_at":ticket.collected_at.isoformat(),
            "collected_by":ticket.collected_by,
            "order_completed":order_done,
            "progress":f"{collected_t}/{total_t}"}

@app.patch("/orders/{order_ref}/status")
def update_status(order_ref: str, body: dict, db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(order_ref=order_ref).first()
    if not o: raise HTTPException(404)
    o.status = body["status"]; db.commit()
    return {"order_ref":order_ref,"status":o.status}

@app.get("/orders/{order_ref}/tickets")
def list_order_tickets(order_ref: str, db: Session = Depends(get_db)):
    tickets = db.query(Ticket).filter_by(order_ref=order_ref).all()
    if not tickets: raise HTTPException(404)
    col = sum(1 for t in tickets if t.status=="collected")
    return {"order_ref":order_ref,"progress":f"{col}/{len(tickets)}",
            "tickets":[{"ticket_code":t.ticket_code,"status":t.status,
                        "unit_number":t.unit_number,"total_units":t.total_units,
                        "collected_at":t.collected_at.isoformat() if t.collected_at else None,
                        "collected_by":t.collected_by} for t in tickets]}

@app.get("/health")
def health(): return {"service":"order","status":"ok"}