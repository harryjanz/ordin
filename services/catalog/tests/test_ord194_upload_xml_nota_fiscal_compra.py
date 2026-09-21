import os
import sys
from pathlib import Path

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


FIXTURES = Path(__file__).parent / "fixtures" / "nfe"


def _xml(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _upload_file(name: str) -> dict:
    return {"file": (name, _xml(name), "application/xml")}


async def _preview(client, token, fname):
    return await client.post(
        "/catalog/supplier-invoices/preview", files=_upload_file(fname), headers=auth(token),
    )


async def _confirm(client, token, fname):
    return await client.post(
        "/catalog/supplier-invoices", files=_upload_file(fname), headers=auth(token),
    )


# ── Upload real válido gera prévia correta ───────────────────────────────

async def test_upload_nfe_real_grande_gera_previa_correta_com_muitos_itens(client, token_owner):
    r = await _preview(client, token_owner, "nfe_grande.xml")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["itens"]) == 41
    assert body["already_imported"] is False
    assert body["fornecedor"]["sera_criado"] is True
    assert body["valor_total"] > 0

    # nada persistido pela prévia
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert r_list.json()["suppliers"] == []


async def test_confirmar_nfe_real_grande_com_muitos_itens_persiste_tudo(client, token_owner):
    # ORD-194 — achado em teste live: xml_raw como BLOB genérico (64KB) estourava
    # com o XML real de 41 itens (~71KB); só a prévia (sem persistir) era exercida
    # nos testes até aqui, o caminho de confirmação nunca tinha sido coberto com
    # este fixture específico. Corrigido pra MEDIUMBLOB (16MB).
    r = await _confirm(client, token_owner, "nfe_grande.xml")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"] is not None
    assert body["supplier_id"] is not None

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    suppliers = r_list.json()["suppliers"]
    assert len(suppliers) == 1
    assert suppliers[0]["id"] == body["supplier_id"]


async def test_upload_nfe_pequena_bare_nfe_sem_envelope(client, token_owner):
    r = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["itens"]) == 1
    assert body["itens"][0]["x_prod"] == "[E-COM11] Cabinet with Doors"


async def test_upload_nfe_com_envelope_procnfe(client, token_owner):
    r = await _preview(client, token_owner, "nfe_procnfe.xml")
    assert r.status_code == 200, r.text
    assert len(r.json()["itens"]) == 1


# ── Fornecedor existente vs. criado automaticamente ──────────────────────

async def test_fornecedor_ja_cadastrado_e_reconhecido_pelo_cnpj(client, token_owner):
    r_supplier = await client.post(
        "/catalog/suppliers", json={"nome": "Fornecedor Existente", "cnpj": "59594315000157"},
        headers=auth(token_owner),
    )
    assert r_supplier.status_code == 201, r_supplier.text
    supplier_id = r_supplier.json()["id"]

    r = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 200, r.text
    assert r.json()["fornecedor"]["existing_supplier_id"] == supplier_id
    assert r.json()["fornecedor"]["sera_criado"] is False
    assert r.json()["fornecedor"]["nome"] == "Fornecedor Existente"


async def test_fornecedor_novo_e_criado_automaticamente_na_confirmacao(client, token_owner):
    r_preview = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r_preview.json()["fornecedor"]["sera_criado"] is True

    r = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 201, r.text
    supplier_id = r.json()["supplier_id"]

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    suppliers = r_list.json()["suppliers"]
    assert len(suppliers) == 1
    assert suppliers[0]["id"] == supplier_id
    assert suppliers[0]["cnpj"] == "59594315000157"


# ── Dedup por chave de acesso ─────────────────────────────────────────────

async def test_confirmar_mesma_nota_duas_vezes_e_rejeitado(client, token_owner):
    r1 = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r1.status_code == 201, r1.text

    r2 = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r2.status_code == 409, r2.text

    # nenhuma duplicata — só 1 fornecedor, mesmo confirmando 2x
    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert len(r_list.json()["suppliers"]) == 1


async def test_preview_nao_e_afetada_por_dedup_mas_sinaliza_already_imported(client, token_owner):
    await _confirm(client, token_owner, "nfe_pequena.xml")

    r = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 200, r.text
    assert r.json()["already_imported"] is True


# ── Item com EAN vazio / "SEM GTIN" ───────────────────────────────────────

async def test_item_sem_gtin_aparece_com_ean_nulo(client, token_owner):
    r = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r.status_code == 200, r.text
    assert r.json()["itens"][0]["c_ean"] is None


# ── Encoding — UTF-8 e ISO-8859-1 ─────────────────────────────────────────

async def test_utf8_com_acentuacao_preserva_caracteres(client, token_owner):
    r = await _preview(client, token_owner, "nfe_iso88591.xml")  # base real é utf-8 antes de re-codificar
    assert r.status_code == 200, r.text


async def test_iso88591_com_acentuacao_preserva_caracteres_sem_mojibake(client, token_owner):
    r = await _preview(client, token_owner, "nfe_iso88591.xml")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fornecedor"]["nome"] == "José Distribuição de Ração Ltda"
    assert body["itens"][0]["x_prod"] == "Ração Premium para Cães 15kg"


async def test_xml_raw_preservado_sem_corromper_acentuacao_na_confirmacao(client, token_owner):
    r = await _confirm(client, token_owner, "nfe_iso88591.xml")
    assert r.status_code == 201, r.text
    # relê via nfelib a partir do xml_raw persistido — mesmo padrão que B2 vai usar
    import main as svc
    from nfelib import XmlParser
    from nfelib.nfe.bindings.v4_0.nfe_v4_00 import Nfe

    async with svc.AsyncSessionLocal() as db:
        from sqlalchemy import select
        invoice = (await db.execute(select(svc.SupplierInvoice))).scalars().first()
        parsed = XmlParser().from_bytes(bytes(invoice.xml_raw), Nfe)
        assert parsed.infNFe.emit.xNome == "José Distribuição de Ração Ltda"


# ── Arquivo não é XML / XML que não é NF-e ────────────────────────────────

async def test_arquivo_nao_xml_e_rejeitado(client, token_owner):
    r = await client.post(
        "/catalog/supplier-invoices/preview",
        files={"file": ("nota.pdf", b"%PDF-1.4 nao e um xml de verdade", "application/pdf")},
        headers=auth(token_owner),
    )
    assert r.status_code == 400, r.text


async def test_xml_que_nao_e_nfe_e_rejeitado(client, token_owner):
    r = await _preview(client, token_owner, "nao_e_nfe.xml")
    assert r.status_code == 400, r.text


# ── mod / finNFe — achados da revisão de PM ───────────────────────────────

async def test_nfce_modelo_65_e_rejeitada(client, token_owner):
    r = await _preview(client, token_owner, "nfce_modelo65.xml")
    assert r.status_code == 400, r.text
    assert "NFC-e" in r.json()["detail"] or "compra" in r.json()["detail"]


async def test_nota_de_devolucao_finnfe_4_e_rejeitada(client, token_owner):
    r = await _preview(client, token_owner, "nfe_devolucao.xml")
    assert r.status_code == 400, r.text


# ── Chave de acesso adulterada ────────────────────────────────────────────

async def test_chave_de_acesso_adulterada_e_rejeitada(client, token_owner):
    r = await _preview(client, token_owner, "nfe_chave_adulterada.xml")
    assert r.status_code == 400, r.text


# ── Valor total zero é aceito ─────────────────────────────────────────────

async def test_nota_com_valor_total_zero_e_aceita(client, token_owner):
    r = await _preview(client, token_owner, "nfe_valor_zero.xml")
    assert r.status_code == 200, r.text
    assert r.json()["valor_total"] == 0.0

    r_confirm = await _confirm(client, token_owner, "nfe_valor_zero.xml")
    assert r_confirm.status_code == 201, r_confirm.text


# ── Prévia é sempre sem estado ────────────────────────────────────────────

async def test_previa_repetida_nao_cria_nada(client, token_owner):
    r1 = await _preview(client, token_owner, "nfe_pequena.xml")
    r2 = await _preview(client, token_owner, "nfe_pequena.xml")
    assert r1.json() == r2.json()

    r_list = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert r_list.json()["suppliers"] == []


# ── Isolamento multi-tenant ────────────────────────────────────────────────

async def test_isolamento_multi_tenant_na_importacao(client, token_owner, token_company_b):
    r_x = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r_x.status_code == 201, r_x.text

    # empresa Y importa uma nota DIFERENTE sem conflito nenhum com X
    r_y = await _confirm(client, token_company_b, "nfe_grande.xml")
    assert r_y.status_code == 201, r_y.text

    list_x = await client.get("/catalog/suppliers", headers=auth(token_owner))
    list_y = await client.get("/catalog/suppliers", headers=auth(token_company_b))
    assert len(list_x.json()["suppliers"]) == 1
    assert len(list_y.json()["suppliers"]) == 1
    assert list_x.json()["suppliers"][0]["id"] != list_y.json()["suppliers"][0]["id"]


# ── Role sem permissão de escrita ─────────────────────────────────────────

async def test_role_sem_permissao_de_escrita_bloqueado(client, token_kiosk):
    r = await _preview(client, token_kiosk, "nfe_pequena.xml")
    assert r.status_code == 403, r.text


# ── Listagem / detalhe / exclusão (achado em teste manual do usuário) ────
# Explorer prometia "aparece na listagem de notas importadas" (Fluxo
# Principal), mas o Tech Explorer nunca operacionalizou isso num endpoint —
# gap real, não escopo cortado de propósito.

async def test_listagem_mostra_notas_confirmadas_mais_recente_primeiro(client, token_owner):
    r_lista_vazia = await client.get("/catalog/supplier-invoices", headers=auth(token_owner))
    assert r_lista_vazia.json()["invoices"] == []

    await _confirm(client, token_owner, "nfe_pequena.xml")
    await _confirm(client, token_owner, "nfe_procnfe.xml")

    r = await client.get("/catalog/supplier-invoices", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    invoices = r.json()["invoices"]
    assert len(invoices) == 2
    # nfe_procnfe.xml (nNF=46320) confirmada depois de nfe_pequena.xml (nNF=1) — aparece primeiro
    assert invoices[0]["numero"] == "46320"
    assert invoices[1]["numero"] == "1"
    assert all("fornecedor_nome" in i and "valor_total" in i for i in invoices)


async def test_previa_sozinha_nao_aparece_na_listagem(client, token_owner):
    await _preview(client, token_owner, "nfe_pequena.xml")
    r = await client.get("/catalog/supplier-invoices", headers=auth(token_owner))
    assert r.json()["invoices"] == []


async def test_detalhe_de_nota_confirmada_traz_todos_os_itens(client, token_owner):
    r_confirm = await _confirm(client, token_owner, "nfe_grande.xml")
    invoice_id = r_confirm.json()["id"]

    r = await client.get(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_owner))
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["itens"]) == 41
    assert body["fornecedor_nome"] == "Alimentos Ltda."
    assert body["valor_total"] > 0


async def test_detalhe_de_nota_inexistente_retorna_404(client, token_owner):
    r = await client.get("/catalog/supplier-invoices/999999", headers=auth(token_owner))
    assert r.status_code == 404


async def test_isolamento_multi_tenant_na_listagem_e_detalhe(client, token_owner, token_company_b):
    r_confirm = await _confirm(client, token_owner, "nfe_pequena.xml")
    invoice_id = r_confirm.json()["id"]

    r_list_b = await client.get("/catalog/supplier-invoices", headers=auth(token_company_b))
    assert r_list_b.json()["invoices"] == []

    r_detail_b = await client.get(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_company_b))
    assert r_detail_b.status_code == 404


async def test_excluir_nota_libera_chave_de_acesso_pra_reimportar(client, token_owner):
    r_confirm = await _confirm(client, token_owner, "nfe_pequena.xml")
    invoice_id = r_confirm.json()["id"]

    r_dup = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r_dup.status_code == 409

    r_del = await client.delete(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_owner))
    assert r_del.status_code == 204

    r_list = await client.get("/catalog/supplier-invoices", headers=auth(token_owner))
    assert r_list.json()["invoices"] == []

    # chave livre de novo — reimportação funciona
    r_reconfirm = await _confirm(client, token_owner, "nfe_pequena.xml")
    assert r_reconfirm.status_code == 201, r_reconfirm.text


async def test_excluir_nota_nao_apaga_o_fornecedor(client, token_owner):
    r_confirm = await _confirm(client, token_owner, "nfe_pequena.xml")
    invoice_id, supplier_id = r_confirm.json()["id"], r_confirm.json()["supplier_id"]

    await client.delete(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_owner))

    r_suppliers = await client.get("/catalog/suppliers", headers=auth(token_owner))
    assert supplier_id in [s["id"] for s in r_suppliers.json()["suppliers"]]


async def test_excluir_nota_de_outra_empresa_retorna_404(client, token_owner, token_company_b):
    r_confirm = await _confirm(client, token_owner, "nfe_pequena.xml")
    invoice_id = r_confirm.json()["id"]

    r_del = await client.delete(f"/catalog/supplier-invoices/{invoice_id}", headers=auth(token_company_b))
    assert r_del.status_code == 404

    # não foi excluída de verdade
    r_list = await client.get("/catalog/supplier-invoices", headers=auth(token_owner))
    assert len(r_list.json()["invoices"]) == 1


async def test_excluir_nota_inexistente_retorna_404(client, token_owner):
    r = await client.delete("/catalog/supplier-invoices/999999", headers=auth(token_owner))
    assert r.status_code == 404


# ── Validação isolada do algoritmo de chave de acesso ─────────────────────

def test_valida_chave_acesso_contra_chaves_reais_autorizadas():
    import main as svc

    chaves_reais = [
        "35200159594315000157550010000000012062777161",
        "41170706117473000150550010000463202612756525",
        "35180834128745000152550010000476861118934859",
    ]
    for chave in chaves_reais:
        assert svc._valida_chave_acesso(chave) is True

    adulterada = chaves_reais[0][:-1] + ("1" if chaves_reais[0][-1] != "1" else "2")
    assert svc._valida_chave_acesso(adulterada) is False
    assert svc._valida_chave_acesso("123") is False  # tamanho errado
    assert svc._valida_chave_acesso("a" * 44) is False  # não numérico
