"""Crea (o actualiza la contraseña de) un administrador.

Uso, desde la carpeta backend/:
    python -m scripts.crear_admin
"""
import asyncio
import getpass
import re

import asyncpg

from app.config import get_settings
from app.security import hashear_password


def _pedir_datos() -> tuple[str, str, str]:
    email = input("Correo del administrador: ").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise SystemExit("Correo inválido.")

    nombre = input("Nombre: ").strip()
    if not nombre:
        raise SystemExit("El nombre es obligatorio.")

    password = getpass.getpass("Contraseña (mínimo 10 caracteres): ")
    if not 10 <= len(password.encode("utf-8")) <= 72:
        raise SystemExit("La contraseña debe tener entre 10 y 72 caracteres.")
    if password != getpass.getpass("Repite la contraseña: "):
        raise SystemExit("Las contraseñas no coinciden.")
    return email, nombre, password


async def main() -> None:
    email, nombre, password = _pedir_datos()
    conexion = await asyncpg.connect(get_settings().database_url, statement_cache_size=0)
    try:
        await conexion.execute(
            """insert into administradores (email, nombre, password_hash)
               values ($1, $2, $3)
               on conflict (email) do update
               set nombre = excluded.nombre, password_hash = excluded.password_hash, activo = true""",
            email, nombre, hashear_password(password),
        )
    finally:
        await conexion.close()
    print(f"Listo: {email} ya puede entrar al panel.")


if __name__ == "__main__":
    asyncio.run(main())
