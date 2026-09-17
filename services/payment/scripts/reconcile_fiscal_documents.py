"""Reenvia notas fiscais (NFC-e) pendentes dentro de uma janela de 24h, e
marca como "falha_definitiva" as que passaram desse prazo sem se resolver.

Job standalone, não agendado por código (ver ORD-175 Tech Explorer: o
mecanismo de disparo periódico — cron do host, tarefa agendada do ECS, etc
— é decisão de infra/deploy, fora do escopo deste script). Mesmo padrão do
sync_ncm.py do catalog-service (ORD-169).

Uso (dentro do container do payment-service, ou local com as mesmas env
vars de DB_URL/INTERNAL_SECRET/etc já exigidas por main.py):

    python -m scripts.reconcile_fiscal_documents

Idempotente por construção: consulta o status na Focus NFe (GET /nfce/{ref})
antes de qualquer reenvio — nunca duplica emissão (ver
reconcile_pending_fiscal_documents em main.py).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import reconcile_pending_fiscal_documents

if __name__ == "__main__":
    asyncio.run(reconcile_pending_fiscal_documents())
