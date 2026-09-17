"""Varre empresas com módulo fiscal ativo e certificado digital A1 com
validade conhecida, e dispara e-mail de alerta ao cruzar os marcos de 30,
15, 7 e 1 dia(s) antes do vencimento (e um marco final pra já vencido).

Job standalone, não agendado por código (ver ORD-176 Tech Explorer: o
mecanismo de disparo periódico — cron do host, tarefa agendada do ECS, etc
— é decisão de infra/deploy, fora do escopo deste script). Mesmo padrão do
sync_ncm.py do catalog-service (ORD-169) e do reconcile_fiscal_documents.py
do payment-service (ORD-175).

Uso (dentro do container do company-service, ou local com as mesmas env
vars de DB_URL/NOTIFICATION_SERVICE_URL/etc já exigidas por main.py):

    python -m scripts.check_certificate_expirations

Idempotente por construção: cada empresa só recebe um e-mail por marco
(controlado por CompanyFiscalConfig.certificado_ultimo_alerta_dias) —
rodar de novo no mesmo dia não duplica nada.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import check_certificate_expirations

if __name__ == "__main__":
    asyncio.run(check_certificate_expirations())
