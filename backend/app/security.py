"""Contraseñas (bcrypt) y tokens de sesión (JWT)."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import Settings

ALGORITMO = "HS256"


def hashear_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verificar_password(password: str, password_hash: str) -> bool:
    datos = password.encode("utf-8")
    if len(datos) > 72:  # límite de bcrypt
        return False
    return bcrypt.checkpw(datos, password_hash.encode("utf-8"))


def crear_token(admin_id: int, settings: Settings) -> str:
    ahora = datetime.now(timezone.utc)
    payload = {
        "sub": str(admin_id),
        "iat": ahora,
        "exp": ahora + timedelta(minutes=settings.jwt_minutos_expiracion),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITMO)


def leer_token(token: str, settings: Settings) -> int:
    """Devuelve el id del admin. Lanza jwt.PyJWTError si el token es inválido o expiró."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITMO], options={"require": ["exp", "sub"]})
    return int(payload["sub"])
