"""Ink Fever API: backend del panel de administración."""
import json
import logging
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, categorias, prendas, utilidades
from app.services import cloudinary_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


async def _preparar_conexion(conexion: asyncpg.Connection) -> None:
    # Los campos json de PostgreSQL llegan como objetos de Python, no como texto.
    await conexion.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


@asynccontextmanager
async def lifespan(app: FastAPI):
    cloudinary_service.configurar(settings)
    app.state.pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=5,
        statement_cache_size=0,  # compatible con el pooler de Supabase
        init=_preparar_conexion,
    )
    yield
    await app.state.pool.close()


app = FastAPI(
    title="Ink Fever API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.mostrar_docs else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.mostrar_docs else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origenes,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(categorias.router)
app.include_router(prendas.router)
app.include_router(utilidades.router)


@app.get("/api/salud", tags=["sistema"])
async def salud() -> dict:
    """El panel la llama al abrirse para "despertar" la API en Render."""
    return {"estado": "ok"}
