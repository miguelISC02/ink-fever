"""CRUD de categorías (las "marcas" del carrusel). Solo admin."""
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import admin_actual, get_db
from app.schemas import CategoriaEntrada, CategoriaSalida
from app.texto import slugify

router = APIRouter(
    prefix="/api/admin/categorias",
    tags=["categorías"],
    dependencies=[Depends(admin_actual)],
)

COLUMNAS = "id, nombre, slug, orden, activa"


def _slug_o_error(nombre: str) -> str:
    slug = slugify(nombre)
    if not slug:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El nombre debe tener letras o números")
    return slug


@router.get("", response_model=list[CategoriaSalida])
async def listar(db: asyncpg.Connection = Depends(get_db)) -> list[dict]:
    filas = await db.fetch(f"select {COLUMNAS} from categorias order by orden, nombre")
    return [dict(f) for f in filas]


@router.post("", response_model=CategoriaSalida, status_code=status.HTTP_201_CREATED)
async def crear(datos: CategoriaEntrada, db: asyncpg.Connection = Depends(get_db)) -> dict:
    try:
        fila = await db.fetchrow(
            f"""insert into categorias (nombre, slug, orden, activa)
                values ($1, $2, $3, $4) returning {COLUMNAS}""",
            datos.nombre, _slug_o_error(datos.nombre), datos.orden, datos.activa,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una categoría con ese nombre")
    return dict(fila)


@router.put("/{categoria_id}", response_model=CategoriaSalida)
async def actualizar(
    categoria_id: int, datos: CategoriaEntrada, db: asyncpg.Connection = Depends(get_db)
) -> dict:
    try:
        fila = await db.fetchrow(
            f"""update categorias set nombre = $1, slug = $2, orden = $3, activa = $4
                where id = $5 returning {COLUMNAS}""",
            datos.nombre, _slug_o_error(datos.nombre), datos.orden, datos.activa, categoria_id,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una categoría con ese nombre")
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
    return dict(fila)


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def borrar(categoria_id: int, db: asyncpg.Connection = Depends(get_db)) -> None:
    """Las prendas de esta categoría no se borran: quedan sin categoría."""
    resultado = await db.execute("delete from categorias where id = $1", categoria_id)
    if resultado == "DELETE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Categoría no encontrada")
