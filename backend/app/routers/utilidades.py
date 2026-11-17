"""Autocompletado de etiquetas y firma para subir imágenes. Solo admin."""
import asyncpg
from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.deps import admin_actual, get_db
from app.schemas import EtiquetaSalida, FirmaSubida
from app.services import cloudinary_service as cloudinary
from app.texto import normalizar_etiqueta

router = APIRouter(prefix="/api/admin", dependencies=[Depends(admin_actual)])


@router.get("/etiquetas", response_model=list[EtiquetaSalida], tags=["etiquetas"])
async def listar_etiquetas(
    q: str | None = Query(None, max_length=40, description="Texto para autocompletar"),
    db: asyncpg.Connection = Depends(get_db),
) -> list[dict]:
    filtro = normalizar_etiqueta(q) if q else None
    filas = await db.fetch(
        """select e.nombre, count(pe.prenda_id)::int as usos
           from etiquetas e
           left join prenda_etiqueta pe on pe.etiqueta_id = e.id
           where $1::text is null or e.nombre like '%' || $1 || '%'
           group by e.id
           order by usos desc, e.nombre
           limit 50""",
        filtro or None,
    )
    return [dict(f) for f in filas]


@router.post("/cloudinary/firma", response_model=FirmaSubida, tags=["imágenes"])
async def firmar_subida(settings: Settings = Depends(get_settings)) -> dict:
    """Pide una firma por cada imagen que vayas a subir."""
    return cloudinary.generar_firma(settings)
