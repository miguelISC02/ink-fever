"""Dependencias que se inyectan en los endpoints."""
from collections.abc import AsyncIterator

import asyncpg
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.security import leer_token

_bearer = HTTPBearer(auto_error=False)

NO_AUTORIZADO = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sesión inválida o expirada",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_db(request: Request) -> AsyncIterator[asyncpg.Connection]:
    """Una conexión del pool por petición (FastAPI la reutiliza dentro de la misma petición)."""
    async with request.app.state.pool.acquire() as conexion:
        yield conexion


async def admin_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: asyncpg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    if credenciales is None:
        raise NO_AUTORIZADO
    try:
        admin_id = leer_token(credenciales.credentials, settings)
    except (jwt.PyJWTError, ValueError):
        raise NO_AUTORIZADO

    admin = await db.fetchrow(
        "select id, email, nombre from administradores where id = $1 and activo",
        admin_id,
    )
    if admin is None:
        raise NO_AUTORIZADO
    return dict(admin)
