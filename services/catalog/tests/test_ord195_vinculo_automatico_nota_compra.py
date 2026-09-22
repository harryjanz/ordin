import os
import sys

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


# ── Geração de NF-e fictícia mas estruturalmente válida ──────────────────
# Mesmo algoritmo real (mod-11, pesos cíclicos 2-9) usado pela chave de acesso
# de verdade — permite gerar quantas notas forem precisas pros cenários,
# cada uma com CNPJ/chave válidos, sem depender de fixtures fixas.

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
            <verProc>Teste ORD-195</verProc>
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
    """itens: cada dict precisa de c_prod, c_ean (ou "" pra SEM GTIN), x_prod,
    q_com, v_un_com, v_prod — u_com/u_trib/q_trib/v_un_trib são opcionais,
    default sem divergência (uTrib=uCom, qTrib=qCom, vUnTrib=vUnCom)."""
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


async def _create_product(client, token, name="Produto", ean=None, **extra):
    body = {"name": name, "price": 9.9, **extra}
    if ean is not None:
        body["ean"] = ean
    r = await client.post("/catalog/products", json=body, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _create_option(client, token, label="Opção", ean=None, cfop=None, group_name="Grupo", active=True):
    option_body = {"label": label, "active": active}
    if ean is not None:
        option_body["ean"] = ean
    if cfop is not None:
        option_body["cfop"] = cfop
    r = await client.post(
        "/catalog/option-groups",
        json={"name": group_name, "min_selections": 1, "max_selections": 1, "options": [option_body]},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["id"], body["options"][0]["id"]


async def _entrada_manual(client, token, product_id, quantidade=1, unidade="un"):
    r = await client.post(
        f"/catalog/products/{product_id}/stock/movements",
        json={"tipo": "entrada", "quantidade": quantidade, "unidade": unidade},
        headers=auth(token),
    )
    assert r.status_code == 201, r.text


# ── Nível 1: EAN de venda ──────────────────────────────────────────────────

async def test_vinculo_por_ean_de_venda(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    xml = _build_nfe("11111111", 1, [
        {"c_prod": "COCA350", "c_ean": "7894900010015", "x_prod": "COCA-COLA LATA 350ML",
         "q_com": "24.0000", "v_un_com": "3.8000000000", "v_prod": "91.20"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_vinculados"] == 1
    assert r.json()["itens_pendentes"] == 0

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 25  # 1 (manual) + 24 (vínculo automático)

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    item = detail.json()["itens"][0]
    assert item["link_source"] == "ean"
    assert item["product_id"] == pid
    assert item["link_label"] == "Coca-Cola Lata 350ml"
    assert item["pendente_motivo"] is None


async def test_ean_de_produto_inativo_nao_vincula(client, token_owner):
    pid = await _create_product(client, token_owner, name="Produto Inativo", ean="9990000000005")
    r_inativo = await client.put(f"/catalog/products/{pid}", json={"active": False}, headers=auth(token_owner))
    assert r_inativo.status_code == 200, r_inativo.text

    xml = _build_nfe("22222222", 1, [
        {"c_prod": "X1", "c_ean": "9990000000005", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    item = detail.json()["itens"][0]
    assert item["link_source"] is None
    assert item["pendente_motivo"] is None  # sem correspondência simples, não é um motivo específico


async def test_qtrib_divergente_e_consistente_usa_qtrib(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    xml = _build_nfe("33333333", 1, [
        {"c_prod": "COCA350FD", "c_ean": "7894900010015", "x_prod": "COCA-COLA FARDO",
         "u_com": "FD", "q_com": "1.0000", "v_un_com": "42.00", "v_prod": "42.00",
         "u_trib": "UN", "q_trib": "12.0000", "v_un_trib": "3.50"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_vinculados"] == 1

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 13  # 1 (manual) + 12 (qTrib, não qCom que seria 1)


async def test_qtrib_inconsistente_com_total_cai_pra_qcom(client, token_owner):
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    xml = _build_nfe("44444444", 1, [
        {"c_prod": "COCA350FD", "c_ean": "7894900010015", "x_prod": "COCA-COLA FARDO",
         "u_com": "FD", "q_com": "1.0000", "v_un_com": "42.00", "v_prod": "42.00",
         # 12 x 1.00 = 12.00, não bate com vProd 42.00 — tolerância de 0.05 rejeita
         "u_trib": "UN", "q_trib": "12.0000", "v_un_trib": "1.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 2  # 1 (manual) + 1 (qCom, não o qTrib inconsistente)


# ── Nível 2: GTIN de embalagem ──────────────────────────────────────────────

async def test_vinculo_por_gtin_de_embalagem(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="7894900011340", product_id=pid,
            quantidade_por_unidade=12, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("55555555", 1, [
        {"c_prod": "FARDO12", "c_ean": "7894900011340", "x_prod": "FARDO COCA-COLA 12X",
         "q_com": "5.0000", "v_un_com": "42.00", "v_prod": "210.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_vinculados"] == 1

    state = await client.get(f"/catalog/products/{pid}/stock", headers=auth(token_owner))
    assert state.json()["quantidade_atual"] == 61  # 1 (manual) + 60 (5 fardos x 12)

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["link_source"] == "gtin_alt"


async def test_gtin_de_embalagem_vale_pra_qualquer_fornecedor(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="7894900011340", product_id=pid,
            quantidade_por_unidade=12, created_by=1,
        ))
        await db.commit()

    item = {"c_prod": "F12", "c_ean": "7894900011340", "x_prod": "FARDO", "q_com": "1.0000",
            "v_un_com": "42.00", "v_prod": "42.00"}
    xml_a = _build_nfe("66666666", 1, [item], emit_nome="Fornecedor A")
    xml_b = _build_nfe("77777777", 1, [item], emit_nome="Fornecedor B")

    r_a = await _confirm_xml(client, token_owner, xml_a)
    r_b = await _confirm_xml(client, token_owner, xml_b)
    assert r_a.status_code == 201 and r_a.json()["itens_vinculados"] == 1
    assert r_b.status_code == 201 and r_b.json()["itens_vinculados"] == 1


async def test_gtin_de_embalagem_nunca_visto_vira_pendencia(client, token_owner):
    xml = _build_nfe("88888888", 1, [
        {"c_prod": "DESCONHECIDO", "c_ean": "7899999999999", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1


# ── Nível 3: código do fornecedor ──────────────────────────────────────────

async def test_vinculo_por_codigo_do_fornecedor(client, token_owner):
    import main as svc
    pid = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean=None)
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    cnpj = _cnpj_valido("99999999")
    r_supplier = await client.post(
        "/catalog/suppliers", json={"nome": "Fornecedor X", "cnpj": cnpj}, headers=auth(token_owner),
    )
    assert r_supplier.status_code == 201, r_supplier.text
    supplier_id = r_supplier.json()["id"]

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.SupplierProductCode(
            company_id=1, supplier_id=supplier_id, c_prod="REF-X-350", product_id=pid, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("99999999", 1, [
        {"c_prod": "REF-X-350", "c_ean": "", "x_prod": "COCA-COLA LATA 350ML",
         "q_com": "10.0000", "v_un_com": "3.80", "v_prod": "38.00"},
    ], emit_nome="Fornecedor X")
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_vinculados"] == 1

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["link_source"] == "supplier_code"


async def test_mapeamento_de_cprod_isolado_por_fornecedor(client, token_owner):
    import main as svc
    pid_a = await _create_product(client, token_owner, name="Produto A")

    cnpj_x = _cnpj_valido("10101010")
    r_x = await client.post("/catalog/suppliers", json={"nome": "Fornecedor X", "cnpj": cnpj_x}, headers=auth(token_owner))
    supplier_x_id = r_x.json()["id"]

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.SupplierProductCode(
            company_id=1, supplier_id=supplier_x_id, c_prod="COD-01", product_id=pid_a, created_by=1,
        ))
        await db.commit()

    # Fornecedor Y (diferente), mesmo cProd — não deve casar
    xml = _build_nfe("20202020", 1, [
        {"c_prod": "COD-01", "c_ean": "", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ], emit_nome="Fornecedor Y")
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1


# ── Sem correspondência em nenhum nível ─────────────────────────────────────

async def test_item_sem_qualquer_correspondencia_fica_pendente(client, token_owner):
    xml = _build_nfe("30303030", 1, [
        {"c_prod": "NOVO", "c_ean": "", "x_prod": "ITEM NOVO", "q_com": "1.0000",
         "v_un_com": "5.00", "v_prod": "5.00"},
        {"c_prod": "ANTIGO", "c_ean": "7894900010015", "x_prod": "OUTRO", "q_com": "1.0000",
         "v_un_com": "1.00", "v_prod": "1.00"},
    ])
    # produto do 2º item não existe ainda — os dois ficam pendentes, confirmação continua ok
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 2
    assert r.json()["itens_vinculados"] == 0


async def test_fardo_de_uso_misto_sempre_casa_num_destino_so(client, token_owner):
    import main as svc
    pid_lata = await _create_product(client, token_owner, name="Coca-Cola Lata 350ml", ean="7894900010015")
    await _entrada_manual(client, token_owner, pid_lata, quantidade=1, unidade="un")

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="7894900011340", product_id=pid_lata,
            quantidade_por_unidade=12, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("40404040", 1, [
        {"c_prod": "F12", "c_ean": "7894900011340", "x_prod": "FARDO", "q_com": "1.0000",
         "v_un_com": "42.00", "v_prod": "42.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    item = detail.json()["itens"][0]
    assert item["link_source"] == "gtin_alt"
    assert item["product_id"] == pid_lata  # sempre a Lata, nunca "dividido"


# ── Precedência entre níveis ─────────────────────────────────────────────

async def test_nivel_1_sempre_vence_sobre_nivel_2(client, token_owner):
    import main as svc
    pid_x = await _create_product(client, token_owner, name="Product X", ean="1234567890128")
    pid_y = await _create_product(client, token_owner, name="Product Y")
    await _entrada_manual(client, token_owner, pid_x, quantidade=1, unidade="un")
    await _entrada_manual(client, token_owner, pid_y, quantidade=1, unidade="un")

    async with svc.AsyncSessionLocal() as db:
        # cadastro indevido — nada no schema impede, C2 devia validar na escrita
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="1234567890128", product_id=pid_y, quantidade_por_unidade=1, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("50505050", 1, [
        {"c_prod": "X1", "c_ean": "1234567890128", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    item = detail.json()["itens"][0]
    assert item["link_source"] == "ean"
    assert item["product_id"] == pid_x  # nível 1 vence, nunca Y


# ── Limitação guarda-chuva ─────────────────────────────────────────────────

async def test_item_casa_com_produto_guarda_chuva(client, token_owner):
    pid = await _create_product(client, token_owner, name="Refrigerantes", ean="5550000000005")
    _, option_id = await _create_option(client, token_owner, label="Coca-Cola", ean="1112223334448")
    r_group = await client.get("/catalog/option-groups", headers=auth(token_owner))
    group_id = next(g["id"] for g in r_group.json()["option_groups"] if any(o["id"] == option_id for o in g["options"]))
    r_link = await client.put(
        f"/catalog/products/{pid}/option-groups", json={"option_group_ids": [group_id]}, headers=auth(token_owner),
    )
    assert r_link.status_code == 200, r_link.text

    xml = _build_nfe("60606060", 1, [
        {"c_prod": "GC1", "c_ean": "5550000000005", "x_prod": "REFRIGERANTES", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    item = detail.json()["itens"][0]
    assert item["link_source"] is None
    assert item["pendente_motivo"] == "guarda_chuva"


async def test_produto_sem_estoque_iniciado_fica_pendente(client, token_owner):
    # produto tem EAN mas NUNCA recebeu nenhuma movimentação de estoque —
    # _create_stock_movement exige unidade na 1a movimentação, que ninguém
    # informa no fluxo automático.
    await _create_product(client, token_owner, name="Produto Novo", ean="7770000000005")

    xml = _build_nfe("70707070", 1, [
        {"c_prod": "PN1", "c_ean": "7770000000005", "x_prod": "PRODUTO NOVO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_owner, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1

    detail = await client.get(f"/catalog/supplier-invoices/{r.json()['id']}", headers=auth(token_owner))
    assert detail.json()["itens"][0]["pendente_motivo"] == "sem_estoque_iniciado"


# ── Isolamento multi-tenant ─────────────────────────────────────────────────

async def test_vinculo_nunca_atravessa_empresas(client, token_owner, token_company_b):
    pid = await _create_product(client, token_owner, name="Produto A", ean="1112223334448")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    xml = _build_nfe("80808080", 1, [
        {"c_prod": "X1", "c_ean": "1112223334448", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_company_b, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1


async def test_gtin_de_embalagem_nao_vaza_entre_empresas(client, token_owner, token_company_b):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto A", ean="1112223334448")
    await _entrada_manual(client, token_owner, pid, quantidade=1, unidade="un")

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="9998887776662", product_id=pid, quantidade_por_unidade=6, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("90909090", 1, [
        {"c_prod": "X1", "c_ean": "9998887776662", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ])
    r = await _confirm_xml(client, token_company_b, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1


async def test_mapeamento_de_cprod_nao_vaza_entre_empresas(client, token_owner, token_company_b):
    import main as svc
    pid = await _create_product(client, token_owner, name="Produto A")

    cnpj_x = _cnpj_valido("12121212")
    r_x = await client.post("/catalog/suppliers", json={"nome": "Fornecedor X", "cnpj": cnpj_x}, headers=auth(token_owner))
    supplier_x_id = r_x.json()["id"]

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.SupplierProductCode(
            company_id=1, supplier_id=supplier_x_id, c_prod="COD-99", product_id=pid, created_by=1,
        ))
        await db.commit()

    xml = _build_nfe("13131313", 1, [
        {"c_prod": "COD-99", "c_ean": "", "x_prod": "ALGO", "q_com": "1.0000",
         "v_un_com": "10.00", "v_prod": "10.00"},
    ], emit_nome="Fornecedor X")
    r = await _confirm_xml(client, token_company_b, xml)
    assert r.status_code == 201, r.text
    assert r.json()["itens_pendentes"] == 1


# ── Regressão — garantias herdadas das regras de unicidade ─────────────────

async def test_regressao_dois_itens_ativos_nao_podem_ter_mesmo_ean(client, token_owner):
    # ean colide só quando ATIVO (decisão de 2026-09-18) — criar a option já
    # ativa com o mesmo ean do produto seria rejeitado na própria criação;
    # o jeito de exercitar o path de ativação é criar inativa e then ativar.
    await _create_product(client, token_owner, name="Produto A", ean="7894900010015")
    _, option_id = await _create_option(client, token_owner, label="Coca-Cola", ean="7894900010015", active=False)
    r = await client.patch(
        f"/catalog/options/{option_id}", json={"active": True}, headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


async def test_regressao_gtin_de_embalagem_nao_pode_apontar_pra_dois_produtos(client, token_owner):
    import main as svc
    pid_a = await _create_product(client, token_owner, name="Produto A")
    pid_b = await _create_product(client, token_owner, name="Produto B")

    async with svc.AsyncSessionLocal() as db:
        db.add(svc.ProductGtinAlt(
            company_id=1, gtin="1112223334448", product_id=pid_a, quantidade_por_unidade=1, created_by=1,
        ))
        await db.commit()

        with pytest.raises(Exception):  # noqa: B017 — IntegrityError da UniqueConstraint
            db.add(svc.ProductGtinAlt(
                company_id=1, gtin="1112223334448", product_id=pid_b, quantidade_por_unidade=1, created_by=1,
            ))
            await db.commit()
