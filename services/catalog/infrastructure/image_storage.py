"""Armazenamento de imagens de produto — S3 (produção) / MinIO (dev local).

Mesmo padrão do contract_storage.py do company-service: MinIO é compatível
com a API do S3, então o mesmo client boto3 funciona nos dois ambientes — a
única diferença é a presença de S3_ENDPOINT_URL: setada aponta pro MinIO
local; ausente, o boto3 usa o endpoint real da AWS com credenciais via IAM
role (nunca access key/secret key fixas em produção).

O banco guarda a *key* do objeto (ex: "produtos/3/produto-42.jpg"), nunca uma
URL — URLs assinadas expiram, então são geradas sob demanda a cada consulta.

Estrutura de chaves:
  produtos/{category_id}/produto-{product_id}.{ext}            — imagem original
  produtos/{category_id}/produto-{product_id}[thumb].{ext}     — thumbnail
"""
import os

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

_S3_BUCKET = os.getenv("S3_BUCKET", "ordin-catalog")
_S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
# URL assinada precisa ser alcançável pelo navegador de quem carrega a imagem —
# S3_ENDPOINT_URL (nome do serviço Docker, ex: "http://minio:9000") só
# resolve *entre* containers. Em dev local, S3_PUBLIC_ENDPOINT_URL aponta pra
# porta publicada no host (ex: "http://localhost:9000"). Em produção (S3 real,
# sem endpoint customizado nenhum) as duas ficam vazias — sem distinção
# necessária, a URL do S3 já é publicamente resolvível.
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


def _product_image_key(category_id: int, product_id: int, ext: str, thumb: bool) -> str:
    suffix = "[thumb]" if thumb else ""
    return f"produtos/{category_id}/produto-{product_id}{suffix}.{ext}"


def upload_product_image(category_id: int, product_id: int, ext: str, content: bytes) -> str:
    """Sobe a imagem original e retorna a key (não a URL) pra persistir no banco."""
    key = _product_image_key(category_id, product_id, ext, thumb=False)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
    return key


def upload_product_thumbnail(category_id: int, product_id: int, ext: str, content: bytes) -> str:
    """Sobe o thumbnail e retorna a key (não a URL) pra persistir no banco."""
    key = _product_image_key(category_id, product_id, ext, thumb=True)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
    return key


def _option_image_key(option_group_id: int, option_id: int, ext: str, thumb: bool) -> str:
    suffix = "[thumb]" if thumb else ""
    return f"opcoes/{option_group_id}/opcao-{option_id}{suffix}.{ext}"


def upload_option_image(option_group_id: int, option_id: int, ext: str, content: bytes) -> str:
    """Sobe a imagem original de uma opção (ORD-138) e retorna a key (não a URL) pra persistir no banco."""
    key = _option_image_key(option_group_id, option_id, ext, thumb=False)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
    return key


def upload_option_thumbnail(option_group_id: int, option_id: int, ext: str, content: bytes) -> str:
    """Sobe o thumbnail de uma opção e retorna a key (não a URL) pra persistir no banco."""
    key = _option_image_key(option_group_id, option_id, ext, thumb=True)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
    return key


def _combo_image_key(combo_id: int, ext: str, thumb: bool) -> str:
    """ORD-153: sem category_id no caminho (diferente de produto) — Combo
    pode não ter categoria vinculada, e a chave não precisa dela pra ser
    única."""
    suffix = "[thumb]" if thumb else ""
    return f"combos/combo-{combo_id}{suffix}.{ext}"


def upload_combo_image(combo_id: int, ext: str, content: bytes) -> str:
    """Sobe a imagem original de um combo (ORD-153) e retorna a key (não a URL) pra persistir no banco."""
    key = _combo_image_key(combo_id, ext, thumb=False)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
    return key


def upload_combo_thumbnail(combo_id: int, ext: str, content: bytes) -> str:
    """Sobe o thumbnail de um combo e retorna a key (não a URL) pra persistir no banco."""
    key = _combo_image_key(combo_id, ext, thumb=True)
    _client().put_object(Bucket=_S3_BUCKET, Key=key, Body=content)
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
