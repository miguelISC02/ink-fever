"""Todo lo que necesita el secreto de Cloudinary vive aquí y nunca sale del servidor."""
import logging
import time

import cloudinary
import cloudinary.api
import cloudinary.utils
from cloudinary.exceptions import Error as CloudinaryError
from cloudinary.exceptions import NotFound
from starlette.concurrency import run_in_threadpool

from app.config import Settings

log = logging.getLogger(__name__)

# Al subir, Cloudinary reduce la foto a máx. 1600 px: no se guardan originales enormes.
TRANSFORMACION_ENTRADA = "c_limit,w_1600,h_1600"
FORMATOS_PERMITIDOS = "jpg,jpeg,png,webp"


def configurar(settings: Settings) -> None:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def generar_firma(settings: Settings) -> dict:
    """Parámetros firmados para que el panel suba UNA imagen directo a Cloudinary.

    El navegador debe enviar exactamente estos parámetros. Si cambia alguno,
    Cloudinary rechaza la subida. La firma caduca a la hora.
    """
    parametros: dict[str, str | int] = {
        "timestamp": int(time.time()),
        "folder": settings.cloudinary_carpeta,
        "transformation": TRANSFORMACION_ENTRADA,
        "allowed_formats": FORMATOS_PERMITIDOS,
    }
    firma = cloudinary.utils.api_sign_request(parametros, settings.cloudinary_api_secret)
    return {
        "url_subida": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/upload",
        "parametros": {**parametros, "api_key": settings.cloudinary_api_key, "signature": firma},
    }


async def obtener_recurso(public_id: str) -> dict | None:
    """Confirma con Cloudinary que la imagen existe. Así no confiamos en URLs del navegador."""
    try:
        return await run_in_threadpool(cloudinary.api.resource, public_id)
    except NotFound:
        return None


async def borrar_recursos(public_ids: list[str]) -> None:
    """Borra imágenes (y sus versiones generadas). Si falla, solo lo registra en el log."""
    if not public_ids:
        return
    try:
        await run_in_threadpool(cloudinary.api.delete_resources, list(public_ids), invalidate=True)
    except CloudinaryError:
        log.exception("No se pudieron borrar imágenes de Cloudinary: %s", public_ids)
