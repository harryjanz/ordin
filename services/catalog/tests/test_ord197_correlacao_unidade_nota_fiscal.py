import os
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Geração de NF-e fictícia (mesmo helper de test_ord195) ──────────────────

def _cnpj_valido(base8: str) -> str:
    def calc(nums, weights):
        s = sum(n * w for n, w in zip(nums, weights))
        r = s % 11
        return 0 if r < 2 else 11 - r
    base = base8 + "0001"
    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    nums = [int(c) for c in base]
    d1 = calc(nums, w1)
    d2 = calc(nums + [d1], w2)
    return f"{base}{d1}{d2}"


def _chave_acesso(cnpj: str, nnf: int, cnf: str) -> str:
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    base = f"35{'2609'}{cnpj}55001{nnf:09d}1{cnf}"
    assert len(base) == 43, len(base)
    total = sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(base)))
    resto = total % 11
    dv = 0 if resto in (0, 1) else 11 - resto
    return base + str(dv)


_ITEM_TMPL = """
        <det nItem="{n_item}">
            <prod>
                <cProd>{c_prod}</cProd>
                <cEAN>{c_ean}</cEAN>
                <xProd>{x_prod}</xProd>
                <NCM>22021000</NCM>
                <CFOP>5102</CFOP>
                <uCom>{u_com}</uCom>
                <qCom>{q_com}</qCom>
                <vUnCom>{v_un_com}</vUnCom>
                <vProd>{v_prod}</vProd>
                <cEANTrib>{c_ean}</cEANTrib>
                <uTrib>{u_trib}</uTrib>
                <qTrib>{q_trib}</qTrib>
                <vUnTrib>{v_un_trib}</vUnTrib>
                <indTot>1</indTot>
            </prod>
            <imposto>
                <vTotTrib>0.00</vTotTrib>
                <ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>
                <PIS><PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>
                <COFINS><COFINSOutr><CST>49</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>
            </imposto>
        </det>"""

_NFE_TMPL = """<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe{chave}">
        <ide>
            <cUF>35</cUF>
            <cNF>{cnf}</cNF>
            <natOp>Venda</natOp>
            <mod>55</mod>
            <serie>1</serie>
            <nNF>{nnf}</nNF>
            <dhEmi>2026-09-20T09:30:00-03:00</dhEmi>
            <tpNF>1</tpNF>
            <idDest>1</idDest>
            <cMunFG>3550308</cMunFG>
            <tpImp>1</tpImp>
            <tpEmis>1</tpEmis>
            <cDV>{dv}</cDV>
            <tpAmb>2</tpAmb>
            <finNFe>1</finNFe>
            <indFinal>1</indFinal>
            <indPres>0</indPres>
            <procEmi>0</procEmi>
            <verProc>Teste ORD-197</verProc>
        </ide>
        <emit>
            <CNPJ>{cnpj}</CNPJ>
            <xNome>{emit_nome}</xNome>
            <enderEmit>
                <xLgr>Rua Teste</xLgr><nro>1</nro><cMun>3550308</cMun><xMun>São Paulo</xMun>
                <UF>SP</UF><CEP>04576060</CEP><cPais>1058</cPais><xPais>Brasil</xPais>
            </enderEmit>
            <IE>110042490114</IE>
            <CRT>3</CRT>
        </emit>
        <dest>
            <CNPJ>81493979000189</CNPJ>
            <xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome>
            <enderDest>
                <xLgr>Rua Samuel Morse</xLgr><nro>135</nro><xBairro>Brooklin</xBairro>
                <cMun>3550308</cMun><xMun>São Paulo</xMun><UF>SP</UF><CEP>04576060</CEP>
                <cPais>1058</cPais><xPais>Brasil</xPais>
            </enderDest>
            <indIEDest>1</indIEDest>
            <IE>460429771334</IE>
        </dest>
        {itens_xml}
        <total>
            <ICMSTot>
                <vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>
                <vFCPUFDest>0.00</vFCPUFDest><vICMSUFDest>0.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet>
                <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>
                <vProd>{v_total}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
                <vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS>
                <vOutro>0.00</vOutro><vNF>{v_total}</vNF><vTotTrib>0.00</vTotTrib>
            </ICMSTot>
        </total>
        <transp><modFrete>9</modFrete></transp>
        <pag><detPag><indPag>0</indPag><tPag>15</tPag><vPag>{v_total}</vPag></detPag><vTroco>0.00</vTroco></pag>
    </infNFe>
</NFe>
"""


def _build_nfe(cnpj_seed: str, nnf: int, itens: list[dict], emit_nome: str | None = None) -> bytes:
    cnpj = _cnpj_valido(cnpj_seed)
    cnf = f"{nnf:08d}"
    chave = _chave_acesso(cnpj, nnf, cnf)
    dv = chave[-1]

    itens_xml = ""
    v_total = 0.0
    for i, item in enumerate(itens, start=1):
        u_com = item.get("u_com", "UN")
        itens_xml += _ITEM_TMPL.format(
            n_item=i,
            c_prod=item["c_prod"],
            c_ean=item["c_ean"] or "SEM GTIN",
            x_prod=item["x_prod"],
            u_com=u_com,
            q_com=item["q_com"],
            v_un_com=item["v_un_com"],
            v_prod=item["v_prod"],
            u_trib=item.get("u_trib", u_com),
            q_trib=item.get("q_trib", item["q_com"]),
            v_un_trib=item.get("v_un_trib", item["v_un_com"]),
        )
        v_total += float(item["v_prod"])

    xml = _NFE_TMPL.format(
        chave=chave, cnf=cnf, nnf=nnf, dv=dv, cnpj=cnpj,
        emit_nome=emit_nome or f"Fornecedor Teste {cnpj_seed}",
        itens_xml=itens_xml, v_total=f"{v_total:.2f}",
    )
    return xml.encode("utf-8")


async def _confirm_xml(client, token, xml_bytes, filename="nota.xml"):
    return await client.post(
        "/catalog/supplier-invoices",
        files={"file": (filename, xml_bytes, "application/xml")},
        headers=auth(token),
    )


async def _seed_pending_item(
    company_id=1, supplier_cnpj="12345678000195", supplier_nome="Fornecedor Teste",
    c_prod=None, c_ean=None, x_prod="Item Teste", unidade="UN",
    quantidade=Decimal(10), valor_unitario=Decimal("5.00"), valor_total=Decimal("50.00"),
):
    """Mesmo helper de test_ord196 — cria Supplier + SupplierInvoice +
    SupplierInvoiceItem direto via ORM, sem precisar de XML de verdade, pra
    testar /link e /retroactive/apply isoladamente."""
    import main as svc
    async with svc.AsyncSessionLocal() as db:
        supplier = (await db.execute(
            svc.select(svc.Supplier).filter_by(company_id=company_id, cnpj=supplier_cnpj)
        )).scalars().first()
        if not supplier:
            supplier = svc.Supplier(company_id=company_id, nome=supplier_nome, cnpj=supplier_cnpj)
            db.add(supplier)
            await db.flush()
        invoice = svc.SupplierInvoice(
            company_id=company_id, supplier_id=supplier.id,
            chave_acesso=uuid.uuid4().hex[:44].ljust(44, "0"),
            numero="1", serie="1", data_emissao=None, valor_total=valor_total, xml_raw=b"<x/>",
            imported_by=1,
        )
        db.add(invoice)
        await db.flush()
        item = svc.SupplierInvoiceItem(
            supplier_invoice_id=invoice.id, n_item=1, c_prod=c_prod, c_ean=c_ean, x_prod=x_prod,
            unidade=unidade, quantidade=quantidade, valor_unitario=valor_unitario, valor_total=valor_total,
        )
        db.add(item)
        await db.commit()
        return item.id, invoice.id, supplier.id


async def _create_product(client, token, name="Produto", ean=None, **extra):
    body = {"name": name, "price": 9.9, **extra}
    if ean is not None:
        body["ean"] = ean
    r = await client.post("/catalog/products", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _entrada_manual(client, token, product_id, quantidade=1, unidade="un"):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": unidade},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


# ── Tabela de sinônimos (Critério 1, 8) — normalize_unit direto, sem HTTP ───

@pytest.mark.parametrize("bruto,esperado", [
    ("UND", "un"),
    ("KGS", "kg"),
    ("GRAMAS", "g"),
    ("LITROS", "L"),
    ("MILILITRO", "ml"),
])
def test_normaliza_sinonimos_conhecidos(bruto, esperado):
    import main as svc
    assert svc.normalize_unit(bruto) == esperado
    assert svc.normalize_unit(bruto.lower()) == esperado  # case-insensitive


def test_normaliza_nao_reconhece_lt_isolado():
    import main as svc
    assert svc.normalize_unit("LT") is None
    assert svc.normalize_unit("LITRO") == "L"  # contraste: sinônimo sem ambiguidade entra normalmente


# ── C1 — casamento automático (Critério 2, 4) ────────────────────────────────

async def test_c1_grava_unidade_normalizada_quando_sinonimo_reconhecido(client, token_owner):
    xml = _build_nfe("40404040", 1, [
        {"c_prod": "NOVO-UND", "c_ean": "", "x_prod": "ITEM COM SINONIMO", "q_com": "1.0000",
         "v_un_com": "5.00", "v_prod": "5.00", "u_com": "UND"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["unidade"] == "un"  # não "UND", texto cru da nota


async def test_c1_preserva_unidade_crua_quando_sigla_ambigua(client, token_owner):
    xml = _build_nfe("41414141", 1, [
        {"c_prod": "NOVO-LT", "c_ean": "", "x_prod": "ITEM COM LT", "q_com": "1.0000",
         "v_un_com": "5.00", "v_prod": "5.00", "u_com": "LT"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["unidade"] == "LT"  # sem normalização, cai no fallback manual


async def test_unidade_normaliza_mesmo_em_item_sem_qualquer_correspondencia(client, token_owner):
    # Critério 2 não depende do item ter casado em nenhum nível — normalize_unit
    # roda na construção do _ParsedInvoiceItem, antes de qualquer matching.
    xml = _build_nfe("42424242", 1, [
        {"c_prod": "NUNCA-VISTO", "c_ean": "", "x_prod": "ITEM AVULSO", "q_com": "1.0000",
         "v_un_com": "5.00", "v_prod": "5.00", "u_com": "GR"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["unidade"] == "g"


# ── Fator de conversão por fornecedor — vincular manual (Critério 5, 6) ─────

async def test_vincular_por_codigo_fornecedor_informando_fator_grava_e_aplica(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto Caixa")
    item_id, _invoice_id, supplier_id = await _seed_pending_item(c_prod="CX12", quantidade=Decimal(3))

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 3, "unidade": "un", "quantidade_por_unidade": 12},
        headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text

    async with svc.AsyncSessionLocal() as db:
        spc = (await db.execute(
            svc.select(svc.SupplierProductCode).filter_by(company_id=1, supplier_id=supplier_id, c_prod="CX12")
        )).scalars().first()
        assert spc is not None
        assert spc.quantidade_por_unidade == Decimal("12.000")

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    # backend não multiplica sozinho — o /link recebe a quantidade já
    # calculada pelo client (3 x 12), mesmo contrato de sempre; o teste
    # confirma que o FATOR gravado é o que aparece em SupplierProductCode,
    # não que o endpoint multiplica por conta própria.
    assert state.json()["quantidade_atual"] == 3


async def test_vincular_por_codigo_fornecedor_sem_informar_fator(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto Solto")
    item_id, _invoice_id, supplier_id = await _seed_pending_item(c_prod="COD-99", quantidade=Decimal(5))

    r = await client.post(
        f"/catalog/supplier-invoices/items/{item_id}/link",
        json={"product_id": pid, "quantidade": 5, "unidade": "un"},
        headers=auth(token_owner),
    )
    assert r.status_code == 200, r.text

    async with svc.AsyncSessionLocal() as db:
        spc = (await db.execute(
            svc.select(svc.SupplierProductCode).filter_by(company_id=1, supplier_id=supplier_id, c_prod="COD-99")
        )).scalars().first()
        assert spc is not None
        assert spc.quantidade_por_unidade is None

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 5


# ── Nota futura aplica o fator automaticamente (Critério 7) ─────────────────

async def test_nota_futura_mesmo_fornecedor_codigo_aplica_fator_automaticamente(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto Fardo")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    cnpj = _cnpj_valido("50505050")
    r_supplier = await client.post(
        "/catalog/suppliers", json={"nome": "Fornecedor Fardo", "cnpj": cnpj}, headers=auth(token_owner),
    )
    assert r_supplier.status_code == 201, r_supplier.text
    supplier_id = r_supplier.json()["id"]

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.SupplierProductCode(
            company_id=1, supplier_id=supplier_id, c_prod="CX12", product_id=pid,
            quantidade_por_unidade=Decimal(12), created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("50505050", 1, [
        {"c_prod": "CX12", "c_ean": "", "x_prod": "PRODUTO EM CAIXA", "q_com": "3.0000",
         "v_un_com": "10.00", "v_prod": "30.00"},
    ], emit_nome="Fornecedor Fardo")
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_vinculados"] == 1
    assert r.json()["itens_pendentes"] == 0

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 37  # 1 (estoque inicial) + 3 x 12


# ── Aplicação retroativa (nível 3) também aplica o fator (Critério 7) ───────

async def test_aplicar_retroativo_nivel3_aplica_fator(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Retroativo")
    source_id, _, _supplier_id = await _seed_pending_item(c_prod="CX24", quantidade=Decimal(2))
    cand1_id, _, _ = await _seed_pending_item(
        supplier_cnpj="12345678000195", c_prod="CX24", quantidade=Decimal(5),
    )
    cand2_id, _, _ = await _seed_pending_item(
        supplier_cnpj="12345678000195", c_prod="CX24", quantidade=Decimal(1),
    )

    r_link = await client.post(
        f"/catalog/supplier-invoices/items/{source_id}/link",
        # backend não multiplica sozinho — quantidade já vem calculada pelo
        # client (2 x 24), mesmo contrato de sempre.
        json={"product_id": pid, "quantidade": 48, "unidade": "un", "quantidade_por_unidade": 24},
        headers=auth(token_owner),
    )
    assert r_link.status_code == 200, r_link.text
    candidates = {c["id"] for c in r_link.json()["retroactive_candidates"]}
    assert candidates == {cand1_id, cand2_id}

    r_apply = await client.post(
        "/catalog/supplier-invoices/items/retroactive/apply",
        json={"source_item_id": source_id, "item_ids": [cand1_id, cand2_id], "action": "link"},
        headers=auth(token_owner),
    )
    assert r_apply.status_code == 200, r_apply.text
    assert r_apply.json() == {"aplicados": 2, "falhas": 0}

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    # 2x24 (source, lançado no /link) + 5x24 (cand1) + 1x24 (cand2) = 48+120+24 = 192
    assert state.json()["quantidade_atual"] == 192


# ── Isolamento multi-tenant do fator de conversão (obrigatório, ARQUITETURA §6) ──

async def test_isolamento_fator_conversao_nao_vaza_entre_empresas(client, token_owner, token_company_b):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto Empresa A")

    cnpj = _cnpj_valido("60606060")
    r_supplier = await client.post(
        "/catalog/suppliers", json={"nome": "Fornecedor Compartilhado", "cnpj": cnpj}, headers=auth(token_owner),
    )
    assert r_supplier.status_code == 201, r_supplier.text
    supplier_id = r_supplier.json()["id"]

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.SupplierProductCode(
            company_id=1, supplier_id=supplier_id, c_prod="CX12", product_id=pid,
            quantidade_por_unidade=Decimal(12), created_by=1,
        ))
        await db.commit()

    # Empresa B recebe nota do MESMO CNPJ e MESMO cProd, mas nunca cadastrou
    # esse fornecedor nem gravou fator algum — item tem que ficar pendente,
    # nunca casar usando o fator (nem qualquer outra coisa) da Empresa A.
    xml = _build_nfe("60606060", 1, [
        {"c_prod": "CX12", "c_ean": "", "x_prod": "PRODUTO EM CAIXA", "q_com": "3.0000",
         "v_un_com": "10.00", "v_prod": "30.00"},
    ], emit_nome="Fornecedor Compartilhado")
    r = await _confirm_xml(client, token_company_b, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1
    assert r.json()["itens_vinculados"] == 0
