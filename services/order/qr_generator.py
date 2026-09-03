# services/order/qr_generator.py
# Gera QR codes localmente — sem dependência de API externa
# Payload JSON assinado com HMAC-SHA256 (anti-adulteração)
# Saída: PNG base64 ou SVG para impressora térmica Epson TM-T20X
#
# requirements: qrcode[pil]==7.4.2  Pillow==10.3.0

import base64
import hashlib
import hmac
import io
import json
import os
from datetime import datetime

import qrcode
import qrcode.image.svg
from PIL import Image
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer

QR_SECRET = os.getenv("QR_SECRET","qr-secret-troque-em-producao")

def _sign(data: dict) -> str:
    payload = json.dumps({k:v for k,v in data.items() if k!="sig"},sort_keys=True)
    return hmac.new(QR_SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest()[:16]

def build_qr_data(ticket_code: str, order_ref: str) -> str:
    data = {"v":1,"id":ticket_code,"ref":order_ref,
            "ts":datetime.utcnow().isoformat(timespec="seconds")}
    data["sig"] = _sign(data)
    return json.dumps(data, separators=(",",":"))

def verify_qr_data(qr_string: str):
    try:
        data = json.loads(qr_string)
        if not hmac.compare_digest(data.get("sig",""), _sign(data)): return None
        return {"ticket_code":data["id"],"order_ref":data["ref"]}
    # ORD-156 — captura ampla intencional: QR escaneado de ticket físico
    # pode vir malformado/adulterado de várias formas (JSON inválido, campo
    # faltando) — qualquer uma vira "QR inválido" (None), não exceção.
    except Exception: return None  # noqa: BLE001

def generate_qr_png_b64(data: str, size: int = 200) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=10,border=3)
    qr.add_data(data); qr.make(fit=True)
    img = qr.make_image(image_factory=StyledPilImage,
                        module_drawer=RoundedModuleDrawer()).convert("RGB")
    img = img.resize((size,size),Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf,format="PNG",optimize=True)
    return base64.b64encode(buf.getvalue()).decode()

def generate_qr_svg(data: str) -> str:
    factory = qrcode.image.svg.SvgPathImage
    qr = qrcode.make(data,image_factory=factory,box_size=10,border=3)
    buf = io.BytesIO(); qr.save(buf)
    return buf.getvalue().decode()