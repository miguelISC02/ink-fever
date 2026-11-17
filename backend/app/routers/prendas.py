"""CRUD de prendas con sus imágenes y etiquetas. Solo admin."""
import asyncio

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.deps import admin_actual, get_db
from app.schemas import PaginaPrendas, PrendaEntrada, PrendaSalida, TipoPrenda, VisibilidadEntrada
from app.services import cloudinary_service as cloudinary

router = APIRouter(
    prefix="/api/admin/prendas",
    tags=["prendas"],
    dependencies=[Depends(admin_actual)],
)

POR_PAGINA = 24


# ---------------------------------------------------------------------
# Funciones de apoyo
# ---------------------------------------------------------------------
async def _obtener(db: asyncpg.Connection, prenda_id: int) -> dict:
    fila = await db.fetchrow("select * from v_catalogo where id = $1", prenda_id)
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prenda no encontrada")
    return dict(fila)


async def _existe(db: asyncpg.Connection, prenda_id: int) -> None:
    if not await db.fetchval("select exists(select 1 from prendas where id = $1)", prenda_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prenda no encontrada")


async def _validar_categoria(db: asyncpg.Connection, categoria_id: int | None) -> None:
    if categoria_id is None:
        return
    if not await db.fetchval("select exists(select 1 from categorias where id = $1)", categoria_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La categoría no existe")


async def _verificar_en_cloudinary(public_ids: list[str], settings: Settings) -> dict[str, str]:
    """Confirma que cada imagen nueva existe en nuestra carpeta y devuelve su URL oficial."""
    if not public_ids:
        return {}
    prefijo = f"{settings.cloudinary_carpeta}/"
    for public_id in public_ids:
        if not public_id.startswith(prefijo):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Imagen no permitida: {public_id}")

    recursos = await asyncio.gather(*(cloudinary.obtener_recurso(p) for p in public_ids))
    urls: dict[str, str] = {}
    for public_id, recurso in zip(public_ids, recursos):
        if recurso is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"La imagen {public_id} no existe en Cloudinary")
        urls[public_id] = recurso["secure_url"]
    return urls


async def _guardar_imagenes(
    db: asyncpg.Connection, prenda_id: int, public_ids: list[str], urls: dict[str, str]
) -> None:
    await db.execute("delete from imagenes_prenda where prenda_id = $1", prenda_id)
    try:
        await db.executemany(
            "insert into imagenes_prenda (prenda_id, public_id, url, orden) values ($1, $2, $3, $4)",
            [(prenda_id, p, urls[p], orden) for orden, p in enumerate(public_ids)],
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Una de las imágenes ya pertenece a otra prenda")


async def _guardar_etiquetas(db: asyncpg.Connection, prenda_id: int, etiquetas: list[str]) -> None:
    await db.execute("delete from prenda_etiqueta where prenda_id = $1", prenda_id)
    if etiquetas:
        await db.execute(
            "insert into etiquetas (nombre) select unnest($1::text[]) on conflict (nombre) do nothing",
            etiquetas,
        )
        await db.execute(
            """insert into prenda_etiqueta (prenda_id, etiqueta_id)
               select $1, id from etiquetas where nombre = any($2::text[])""",
            prenda_id, etiquetas,
        )
    await _limpiar_etiquetas_huerfanas(db)


async def _limpiar_etiquetas_huerfanas(db: asyncpg.Connection) -> None:
    await db.execute(
        "delete from etiquetas e where not exists (select 1 from prenda_etiqueta pe where pe.etiqueta_id = e.id)"
    )


# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------
@router.get("", response_model=PaginaPrendas)
async def listar(
    texto: str | None = Query(None, max_length=100),
    categoria: str | None = Query(None, max_length=70, description="slug de la categoría"),
    tipo: TipoPrenda | None = None,
    pagina: int = Query(1, ge=1),
    db: asyncpg.Connection = Depends(get_db),
) -> dict:
    """Lista todas las prendas (incluidas las ocultas), con la misma búsqueda que la landing."""
    filas = await db.fetch(
        "select * from buscar_prendas($1, $2, $3, $4, $5)",
        texto, categoria, tipo, POR_PAGINA + 1, (pagina - 1) * POR_PAGINA,
    )
    return {
        "pagina": pagina,
        "hay_mas": len(filas) > POR_PAGINA,
        "resultados": [dict(f) for f in filas[:POR_PAGINA]],
    }


@router.get("/{prenda_id}", response_model=PrendaSalida)
async def obtener(prenda_id: int, db: asyncpg.Connection = Depends(get_db)) -> dict:
    return await _obtener(db, prenda_id)


@router.post("", response_model=PrendaSalida, status_code=status.HTTP_201_CREATED)
async def crear(
    datos: PrendaEntrada,
    db: asyncpg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    urls = await _verificar_en_cloudinary(datos.imagenes, settings)

    async with db.transaction():
        await _validar_categoria(db, datos.categoria_id)
        prenda_id = await db.fetchval(
            """insert into prendas (nombre, descripcion, tipo, categoria_id, visible)
               values ($1, $2, $3, $4, $5) returning id""",
            datos.nombre, datos.descripcion, datos.tipo, datos.categoria_id, datos.visible,
        )
        await _guardar_imagenes(db, prenda_id, datos.imagenes, urls)
        await _guardar_etiquetas(db, prenda_id, datos.etiquetas)

    return await _obtener(db, prenda_id)


@router.put("/{prenda_id}", response_model=PrendaSalida)
async def actualizar(
    prenda_id: int,
    datos: PrendaEntrada,
    db: asyncpg.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    await _existe(db, prenda_id)

    filas = await db.fetch("select public_id, url from imagenes_prenda where prenda_id = $1", prenda_id)
    actuales = {f["public_id"]: f["url"] for f in filas}
    nuevas = [p for p in datos.imagenes if p not in actuales]
    urls = {**actuales, **await _verificar_en_cloudinary(nuevas, settings)}

    async with db.transaction():
        await _validar_categoria(db, datos.categoria_id)
        await db.execute(
            """update prendas
               set nombre = $1, descripcion = $2, tipo = $3, categoria_id = $4, visible = $5
               where id = $6""",
            datos.nombre, datos.descripcion, datos.tipo, datos.categoria_id, datos.visible, prenda_id,
        )
        await _guardar_imagenes(db, prenda_id, datos.imagenes, urls)
        await _guardar_etiquetas(db, prenda_id, datos.etiquetas)

    # Solo después de guardar con éxito borramos de Cloudinary las fotos que quitaste.
    await cloudinary.borrar_recursos([p for p in actuales if p not in datos.imagenes])
    return await _obtener(db, prenda_id)


@router.patch("/{prenda_id}/visible", response_model=PrendaSalida)
async def cambiar_visibilidad(
    prenda_id: int, datos: VisibilidadEntrada, db: asyncpg.Connection = Depends(get_db)
) -> dict:
    """Ocultar o mostrar una prenda sin borrarla."""
    resultado = await db.execute("update prendas set visible = $1 where id = $2", datos.visible, prenda_id)
    if resultado == "UPDATE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prenda no encontrada")
    return await _obtener(db, prenda_id)


@router.delete("/{prenda_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar(prenda_id: int, db: asyncpg.Connection = Depends(get_db)) -> None:
    async with db.transaction():
        filas = await db.fetch("select public_id from imagenes_prenda where prenda_id = $1", prenda_id)
        resultado = await db.execute("delete from prendas where id = $1", prenda_id)
        if resultado == "DELETE 0":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Prenda no encontrada")
        await _limpiar_etiquetas_huerfanas(db)

    await cloudinary.borrar_recursos([f["public_id"] for f in filas])
