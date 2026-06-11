from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional
from config import require_env

SECRET = require_env("JWT_SECRET")
ALGO   = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


class TokenPayload(BaseModel):
    sub:         str
    company_id:  int
    role:        str
    terminal_id: Optional[int] = None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> TokenPayload:
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token ausente")
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGO])
        return TokenPayload(
            sub=payload["sub"],
            company_id=payload["company"],
            role=payload["role"],
            terminal_id=payload.get("terminal"),
        )
    except JWTError as e:
        msg = "Token expirado" if "expired" in str(e) else "Token inválido"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=msg)
