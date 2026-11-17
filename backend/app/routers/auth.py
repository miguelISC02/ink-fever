"""Login del administrador."""
import time
from collections import defaultdict

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

from app.config import Settings, get_settings
from app.deps import admin_actual, get_db
from app.schemas import AdminSalida, LoginEntrada, TokenSalida
from app.security import crear_token, hashear_password, verificar_password

router = APIRouter(prefix="/api/auth", tags=["autenticación"])

# Límite simple contra fuerza bruta: 5 intentos fallidos por IP cada 15 minutos.
# Vive en memoria: se reinicia si el servidor se reinicia (suficiente para un solo servidor).
MAX_INTENTOS = 5
VENTANA_SEGUNDOS = 15 * 60
_intentos_fallidos: dict[str, list[float]] = defaultdict(list)

# Hash de relleno: si el correo no existe, igual se gasta el tiempo de verificar
# una contraseña, para no revelar qué correos están registrados.
_HASH_RELLENO = hashear_password("relleno-para-tiempo-constante")


def _revisar_limite(ip: str) -> None:
    ahora = time.monotonic()
    recientes = [t for t in _intentos_fallidos[ip] if ahora - t < VENTANA_SEGUNDOS]
    _intentos_fallidos[ip] = recientes
    if len(recientes) >= MAX_INTENTOS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera unos minutos.",
        )


@router.post("/login", response_model=TokenSalida)
async def login(
    datos: LoginEntrada,
    request: Request,
    db: asyncpg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TokenSalida:
    ip = request.client.host if request.client else "desconocida"
    _revisar_limite(ip)

    admin = await db.fetchrow(
        "select id, password_hash from administradores where email = $1 and activo",
        datos.email.lower(),
    )
    hash_guardado = admin["password_hash"] if admin else _HASH_RELLENO
    valido = await run_in_threadpool(verificar_password, datos.password, hash_guardado)

    if admin is None or not valido:
        _intentos_fallidos[ip].append(time.monotonic())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Correo o contraseña incorrectos")

    _intentos_fallidos.pop(ip, None)
    return TokenSalida(
        access_token=crear_token(admin["id"], settings),
        expira_en_minutos=settings.jwt_minutos_expiracion,
    )


@router.get("/yo", response_model=AdminSalida)
async def yo(admin: dict = Depends(admin_actual)) -> dict:
    """Sirve al panel para saber si el token sigue siendo válido."""
    return admin
