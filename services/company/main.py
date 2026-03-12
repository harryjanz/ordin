# services/company/main.py
# Gerencia empresas, usuários e terminais
# Endpoints internos usados pelo auth-service:
#   POST /internal/validate-pin
#   POST /internal/verify-pin
#   POST /internal/verify-credentials

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session, relationship
from datetime import datetime
import bcrypt, secrets, os

DB_URL = f"mysql+pymysql://fk_company:company_pass@{os.getenv('DB_HOST','mysql')}:3306/fk_company?charset=utf8mb4"
engine = create_engine(DB_URL, pool_pre_ping=True)

class Base(DeclarativeBase): pass

class Company(Base):
    __tablename__ = "companies"
    id         = Column(Integer, primary_key=True)
    name       = Column(String(120))
    document   = Column(String(20))
    pin        = Column(String(8))
    plan       = Column(String(20), default="free")
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer)
    name          = Column(String(80))
    email         = Column(String(120))
    password_hash = Column(String(128))
    role          = Column(String(20), default="cashier")
    active        = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

class Terminal(Base):
    __tablename__ = "terminals"
    id            = Column(Integer, primary_key=True)
    company_id    = Column(Integer)
    label         = Column(String(80))
    terminal_code = Column(String(20))
    tef_number    = Column(String(40))
    tef_serial    = Column(String(40))
    active        = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)
def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

app = FastAPI(title="Company Service")
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_methods=["*"],allow_headers=["*"])

@app.post("/internal/validate-pin")
def validate_pin(body: dict, db: Session = Depends(get_db)):
    co = db.query(Company).filter_by(pin=body["pin"],active=True).first()
    if not co: raise HTTPException(401,"PIN inválido")
    return {"company":{"id":co.id,"name":co.name,"plan":co.plan}}

@app.post("/internal/verify-pin")
def verify_pin(body: dict, db: Session = Depends(get_db)):
    co = db.query(Company).filter_by(pin=body["pin"],active=True).first()
    if not co: raise HTTPException(401,"PIN inválido")
    t  = db.query(Terminal).filter_by(id=body["terminal_id"],company_id=co.id,active=True).first()
    if not t:  raise HTTPException(404,"Terminal não encontrado")
    return {"company":{"id":co.id,"name":co.name,"plan":co.plan},
            "terminal":{"id":t.id,"label":t.label,"tef_number":t.tef_number}}

@app.post("/internal/verify-credentials")
def verify_credentials(body: dict, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=body["email"],active=True).first()
    if not u: raise HTTPException(401)
    if not bcrypt.checkpw(body["password"].encode(),u.password_hash.encode()): raise HTTPException(401)
    return {"id":u.id,"company_id":u.company_id,"role":u.role,"name":u.name}

@app.get("/companies/{company_id}/terminals")
def list_terminals(company_id: int, db: Session = Depends(get_db)):
    ts = db.query(Terminal).filter_by(company_id=company_id,active=True).all()
    return {"terminals":[{"id":t.id,"label":t.label,"terminal_code":t.terminal_code,"tef_number":t.tef_number} for t in ts]}

@app.post("/companies/{company_id}/regenerate-pin")
def regenerate_pin(company_id: int, db: Session = Depends(get_db)):
    co = db.get(Company, company_id)
    if not co: raise HTTPException(404)
    co.pin = str(secrets.randbelow(900000)+100000)
    db.commit()
    return {"pin":co.pin}

@app.get("/health")
def health(): return {"service":"company","status":"ok"}