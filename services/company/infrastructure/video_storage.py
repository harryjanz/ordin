"""Armazenamento de vídeos de modo espera do totem — S3 (produção) / MinIO
(dev local) — ORD-115.

Mesmo padrão de contract_storage.py (mesmo serviço) e do
catalog-service/infrastructure/image_storage.py: MinIO é compatível com a
API do S3, então o mesmo client boto3 funciona nos dois ambientes — a única
diferença é a presença de S3_ENDPOINT_URL: setada aponta pro MinIO local;
ausente, o boto3 usa o endpoint real da AWS com credenciais via IAM role
(nunca access key/secret key fixas em produção).

O banco guarda a *key* do objeto (ex: "totem-videos/3/12.mp4"), nunca uma
URL — URLs assinadas expiram, então são geradas sob demanda a cada consulta.
"""
import os

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

_S3_BUCKET = os.getenv("S3_BUCKET_TOTEM_VIDEOS", "ordin-totem-videos")
_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
# URL assinada precisa ser alcançável pelo navegador/totem que carrega o
# vídeo — S3_ENDPOINT_URL (nome do serviço Docker, ex: "http://minio:9000")
# só resolve *entre* containers. Em dev local, S3_PUBLIC_ENDPOINT_URL aponta
# pra porta publicada no host (ex: "http://localhost:9000"). Em produção (S3
# real, sem endpoint customizado nenhum) as duas ficam vazias.
_S3_PUBLIC_ENDPOINT_URL = os.getenv("S3_PUBLIC_ENDPOINT_URL", _S3_ENDPOINT_URL)
_S3_REGION = os.getenv("AWS_REGION", "us-east-1")


def _client(endpoint_url: str | None = _S3_ENDPOINT_URL):
    kwargs: dict = {"region_name": _S3_REGION}
    if endpoint_url:
        kwargs.update(
            endpoint_url=endpoint_url,
            aws_access_key_id=os.getenv("S3_ACCESS_KEY", "ordin"),
            aws_secret_access_key=os.getenv("S3_SECRET_KEY", ""),
            config=Config(signature_version="s3v4"),
        )
    return boto3.client("s3", **kwargs)


def ensure_bucket() -> None:
    """Cria o bucket se não existir — só em dev (MinIO). Em produção o bucket
    é provisionado via Terraform; a role da aplicação não deve ter permissão
    de s3:CreateBucket (least privilege), então isso é pulado quando
    S3_ENDPOINT_URL não está setada."""
    if not _S3_ENDPOINT_URL:
        return
    client = _client()
    existing = {b["Name"] for b in client.list_buckets().get("Buckets", [])}
    if _S3_BUCKET not in existing:
        client.create_bucket(Bucket=_S3_BUCKET)


def _video_key(company_id: int, video_id: int) -> str:
    return f"totem-videos/{company_id}/{video_id}.mp4"


def upload_video(company_id: int, video_id: int, content: bytes) -> str:
    """Sobe o vídeo e retorna a key (não a URL) pra persistir no banco."""
    key = _video_key(company_id, video_id)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content, ContentType="video/mp4")
    return key


def delete_object(key: str) -> None:
    """Remove um objeto do bucket. Idempotente — não falha se a key já não existir."""
    try:
        _client().delete_object(Bucket=_S3_BUCKET, Key=key)
    except ClientError:
        pass


def presigned_download_url(key: str, expires_in: int = 3600) -> str:
    return _client(endpoint_url=_S3_PUBLIC_ENDPOINT_URL).generate_presigned_url(
        "get_object",
        Params={"Bucket": _S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )
