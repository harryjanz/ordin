"""Apaga companies de teste e dados relacionados por id (hard delete de verdade,
não o soft-delete da API) — usado SÓ depois de confirmação explícita no chat
com o usuário, nunca de forma automática. Ver ORD-065 e a memória de projeto
"verificação ao vivo" (2026-08-05) sobre por que isso existe: os testes E2E
rodam contra o docker compose local real, sem mock, e acumulavam dados sem
limpeza — o manifesto (frontend/admin/e2e/.test-data-manifest.json) marca o
que cada teste criou, este script apaga a lista já confirmada.

Uso (dentro do container do company-service):
    python scripts/cleanup_test_data.py 101 102 103
"""
import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import delete  # noqa: E402

from main import (  # noqa: E402
    AsyncSessionLocal, Company, Terminal, User,
    CompanyContact, CompanyLegalRepresentative, CompanyPaymentConfig,
)

_SEED_IDS = {1, 2, 3}  # Burger House, Pasta & Co, Sweet Corner — init.sql, nunca apagar


async def cleanup(ids: list[int]) -> None:
    if not ids:
        print("Nenhum id informado.")
        return
    blocked = _SEED_IDS & set(ids)
    if blocked:
        raise SystemExit(f"Recusando apagar id(s) do seed real: {sorted(blocked)}")

    async with AsyncSessionLocal() as db:
        for label, model in [
            ("terminals", Terminal), ("users", User), ("contacts", CompanyContact),
            ("legal_rep", CompanyLegalRepresentative), ("payment_configs", CompanyPaymentConfig),
        ]:
            result = await db.execute(delete(model).where(model.company_id.in_(ids)))
            print(f"  {label}: {result.rowcount} linhas removidas")
        result = await db.execute(delete(Company).where(Company.id.in_(ids)))
        print(f"  companies: {result.rowcount} linhas removidas")
        await db.commit()
    print("commit ok")


if __name__ == "__main__":
    ids = [int(x) for x in sys.argv[1:]]
    asyncio.run(cleanup(ids))
