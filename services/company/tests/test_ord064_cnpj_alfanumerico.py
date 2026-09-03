"""ORD-064 — confronto contra vetores oficiais SERPRO + gaps corrigidos:
CNPJ zerado, 404/429 cautelosos pra alfanumérico, promoção automática pra
ATIVA quando nenhum provedor confirma, terceiro provedor cnpj.ws.

Vetores oficiais vêm do material fornecido pelo usuário (PDF SERPRO +
codigos-cnpj-alfanumerico/src/java/README.md) — local, não versionado
(.gitignore:16) — por isso embutidos aqui diretamente."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta

import httpx
import pytest
import respx
from domain.cnpj import is_alphanumeric_cnpj, is_valid_cnpj
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _make_token(role: str, company_id: int) -> str:
    from jose import jwt
    secret = os.environ.get("JWT_SECRET", "test-secret-ci")
    return jwt.encode(
        {"sub": "1", "company": company_id, "role": role,
         "exp": datetime.utcnow() + timedelta(hours=1)},
        secret, algorithm="HS256"
    )


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def client():
    import main as svc
    db_url = os.environ["DB_URL"].replace("mysql+pymysql://", "mysql+aiomysql://")
    test_engine = create_async_engine(db_url, echo=False)
    test_session = async_sessionmaker(test_engine, expire_on_commit=False)
    orig_engine, orig_session = svc.engine, svc.AsyncSessionLocal
    svc.engine = test_engine
    svc.AsyncSessionLocal = test_session
    async with test_engine.begin() as conn:
        await conn.run_sync(svc.Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=svc.app), base_url="http://test") as c:
        yield c
    await test_engine.dispose()
    svc.engine, svc.AsyncSessionLocal = orig_engine, orig_session


@pytest.fixture
def superadmin_token():
    return _make_token("superadmin", 0)


@pytest.fixture
async def _cleanup_company(client):
    import main as svc
    created_ids = []
    yield created_ids
    if created_ids:
        async with svc.AsyncSessionLocal() as db:
            await db.execute(sa_delete(svc.Company).where(svc.Company.id.in_(created_ids)))
            await db.commit()


# ── Vetores oficiais SERPRO — validação completa (domain/cnpj.py) ───────────

@pytest.mark.parametrize("cnpj,esperado", [
    ("12ABC34501DE35", True),
    ("1345C3A5000106", True),
    ("R55231B3000700", False),  # DV errado (real é 57)
    ("90.021.382/0001-22", True),
    ("90.024.778/000123", True),
    ("90.025.108/000101", False),  # DV errado (real é 21)
    ("90.025.255/0001", False),  # incompleto, sem DV
    ("90.024.420/0001A2", False),  # letra na posição do DV
    ("R55231B3000757", True),
])
def test_vetores_oficiais_validacao(cnpj, esperado):
    assert is_valid_cnpj(cnpj) is esperado


def test_cnpj_zerado_e_rejeitado():
    # Checksum "bate" matematicamente (14 zeros -> DV "00", que coincide com
    # os 2 últimos zeros da própria string) mas não é um CNPJ real — as
    # referências oficiais (Java/TS) rejeitam esse caso explicitamente.
    assert is_valid_cnpj("00000000000000") is False


# ── Massa adicional — letras em posições variadas (auto-gerada e auto-validada) ─

@pytest.mark.parametrize("cnpj", [
    "ABCDEFGHIJKL80",  # 100% letras na base
    "A1B2C3D4E5F668",  # alternando letra/dígito
    "1234567ABCDE88",  # dígitos seguidos de letras
    "AB12CD34EF5602",  # pares letra/dígito
    "00A000B000C084",  # letras esparsas
    "ZZ999YY888XX24",  # blocos de letras e dígitos
])
def test_massa_adicional_letras_em_posicoes_variadas(cnpj):
    assert is_valid_cnpj(cnpj) is True


# ── is_alphanumeric_cnpj ──────────────────────────────────────────────────

def test_is_alphanumeric_cnpj():
    assert is_alphanumeric_cnpj("12ABC34501DE35") is True
    assert is_alphanumeric_cnpj("11.222.333/0001-81") is False
    assert is_alphanumeric_cnpj("00000000000000") is False


# ── infrastructure/cnpj_lookup.py — 404/429 cautelosos + terceiro provedor ──

CNPJ_ALFA = "12ABC34501DE35"
CNPJ_NUM = "11222333000181"


async def test_404_em_cnpj_alfanumerico_nao_e_definitivo_tenta_proximo_provedor():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_ALFA}").mock(
            return_value=httpx.Response(200, json={
                "situacao": "ATIVA", "nome": "Empresa Alfa LTDA", "fantasia": "Alfa",
                "cep": "01310100", "logradouro": "Av. Paulista", "numero": "1000",
                "complemento": "", "bairro": "Bela Vista", "municipio": "São Paulo", "uf": "SP",
            })
        )
        result = await lookup_cnpj(CNPJ_ALFA)
    assert result.found is True
    assert result.legal_name == "Empresa Alfa LTDA"


async def test_404_em_cnpj_numerico_continua_definitivo():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_NUM}").mock(return_value=httpx.Response(404))
        result = await lookup_cnpj(CNPJ_NUM)
    assert result.found is False
    assert result.reason == "cnpj_not_found"  # sem tentar os próximos — 404 numérico é confiável


async def test_receitaws_200_com_status_error_nao_e_tratado_como_encontrado():
    # Bug real descoberto via E2E (ORD-064): ReceitaWS retorna HTTP 200 com
    # {"status": "ERROR", ...} no corpo pra CNPJ não encontrado — não é um
    # 404 de verdade. Sem essa checagem, o corpo de erro era lido como uma
    # empresa real (found=True, cadastral_status="NAO_VERIFICADA" pela
    # ausência do campo "situacao"), bloqueando o cadastro por engano.
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_ALFA}").mock(
            return_value=httpx.Response(200, json={
                "status": "ERROR", "message": "CNPJ rejeitado pela Receita Federal",
            })
        )
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        result = await lookup_cnpj(CNPJ_ALFA)
    assert result.found is False
    assert result.reason == "lookup_unavailable"
    assert result.cadastral_status == "ATIVA"  # alfanumérico, nenhum provedor confirmou de verdade


async def test_receitaws_200_com_status_error_em_cnpj_numerico_bloqueia_como_antes():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_NUM}").mock(
            return_value=httpx.Response(200, json={"status": "ERROR", "message": "CNPJ rejeitado"})
        )
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_NUM}").mock(return_value=httpx.Response(404))
        result = await lookup_cnpj(CNPJ_NUM)
    assert result.found is False
    assert result.reason == "cnpj_not_found"  # numérico — corpo de erro do ReceitaWS ainda bloqueia, sem mudança


async def test_todos_provedores_404_alfanumerico_promove_ativa():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        result = await lookup_cnpj(CNPJ_ALFA)
    assert result.found is False
    assert result.reason == "lookup_unavailable"
    assert result.cadastral_status == "ATIVA"  # Gap 3 — confia no DV local


async def test_429_nunca_e_tratado_como_nao_encontrado():
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_NUM}").mock(return_value=httpx.Response(429))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_NUM}").mock(return_value=httpx.Response(429))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_NUM}").mock(return_value=httpx.Response(429))
        result = await lookup_cnpj(CNPJ_NUM)
    assert result.found is False
    assert result.reason == "lookup_unavailable"  # nunca cnpj_not_found, mesmo pra numérico
    assert result.cadastral_status == "NAO_VERIFICADA"  # numérico não ganha a promoção do Gap 3


async def test_cnpjws_terceiro_fallback_sucesso():
    # Payload reduzido, formato real confirmado via chamada de verdade à API
    # durante o desenvolvimento do ORD-064 — estado vem aninhado em
    # estabelecimento.estado.sigla, não um campo "uf" solto.
    from infrastructure.cnpj_lookup import lookup_cnpj
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_NUM}").mock(
            return_value=httpx.Response(200, json={
                "razao_social": "Empresa CNPJWS LTDA",
                "estabelecimento": {
                    "nome_fantasia": "CNPJWS",
                    "situacao_cadastral": "Ativa",
                    "logradouro": "GARIBALDI", "numero": "070", "complemento": None,
                    "bairro": "VILA RICA", "cep": "95760000",
                    "estado": {"sigla": "RS", "nome": "Rio Grande do Sul"},
                    "cidade": {"nome": "São Sebastião do Caí"},
                },
            })
        )
        result = await lookup_cnpj(CNPJ_NUM)
    assert result.found is True
    assert result.cadastral_status == "ATIVA"
    assert result.legal_name == "Empresa CNPJWS LTDA"
    assert result.trade_name == "CNPJWS"
    assert result.state == "RS"
    assert result.city == "São Sebastião do Caí"


# ── POST /companies — Gap 3 ponta a ponta (sem mock de alto nível, exercita cnpj_lookup.py de verdade) ─

async def test_post_companies_alfanumerico_sem_confirmacao_persiste_ativa(client, superadmin_token, _cleanup_company):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_ALFA}").mock(return_value=httpx.Response(404))
        r = await client.post("/companies", headers=auth(superadmin_token), json={
            "name": "Empresa Alfa E2E", "document": CNPJ_ALFA, "state": "SP",
        })
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    assert r.json()["company"]["cadastral_status"] == "ATIVA"


async def test_post_companies_numerico_sem_confirmacao_continua_nao_verificada(client, superadmin_token, _cleanup_company):
    with respx.mock:
        respx.get(f"https://brasilapi.com.br/api/cnpj/v1/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        respx.get(f"https://www.receitaws.com.br/v1/cnpj/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        respx.get(f"https://publica.cnpj.ws/cnpj/{CNPJ_NUM}").mock(side_effect=httpx.ConnectTimeout("timeout"))
        r = await client.post("/companies", headers=auth(superadmin_token), json={
            "name": "Empresa Numerica E2E", "document": CNPJ_NUM, "state": "SP",
        })
    assert r.status_code == 201
    co_id = r.json()["company"]["id"]
    _cleanup_company.append(co_id)
    # Regressão do Gap 3: promoção automática pra ATIVA é exclusiva de alfanumérico
    assert r.json()["company"]["cadastral_status"] == "NAO_VERIFICADA"
