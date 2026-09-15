"""Sincroniza a tabela local ncm_codes contra a tabela oficial de NCM da
Receita Federal, publicada pelo Portal Único de Comércio Exterior (Siscomex).

Job standalone, não agendado por código (ver ORD-169 Tech Explorer: o
mecanismo de disparo periódico — cron do host, tarefa agendada do ECS, etc —
é decisão de infra/deploy, fora do escopo deste script). APScheduler está
nas dependências do serviço mas, como em todo o resto do projeto, não é
usado pra tempo/agendamento (ver decisão documentada no model Promotion).

Uso (dentro do container do catalog-service, ou local com as mesmas env vars
de DB_URL):

    python -m scripts.sync_ncm

Idempotente: upsert por código, roda de novo a qualquer momento.
"""
import asyncio
import sys
from pathlib import Path

import httpx
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import AsyncSessionLocal, NcmCode

NCM_SOURCE_URL = (
    "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json"
)


async def main() -> None:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        resp = await client.get(NCM_SOURCE_URL)
        resp.raise_for_status()
        payload = resp.json()

    nomenclaturas = payload.get("Nomenclaturas", [])
    if not nomenclaturas:
        print("Resposta da API sem nomenclaturas, abortando", file=sys.stderr)
        return

    created, updated = 0, 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(NcmCode))
        existing = {c.codigo: c for c in result.scalars().all()}

        for item in nomenclaturas:
            codigo = item.get("Codigo", "").replace(".", "")
            descricao = item.get("Descricao")
            # a API traz também capítulos/posições (código com menos de 8
            # dígitos) — só o NCM completo (nível de produto) interessa aqui
            if len(codigo) != 8 or not descricao:
                continue

            existing_row = existing.get(codigo)
            if existing_row:
                existing_row.descricao = descricao
                updated += 1
            else:
                db.add(NcmCode(codigo=codigo, descricao=descricao))
                created += 1

        await db.commit()

    print(f"Total: {created} códigos criados, {updated} atualizados", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
