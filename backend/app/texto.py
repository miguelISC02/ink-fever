"""Normalización de texto para etiquetas y slugs."""
import re
import unicodedata


def quitar_acentos(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def normalizar_etiqueta(texto: str) -> str:
    """'  Gokú   SSJ ' -> 'goku ssj'. Solo letras, números, espacios y guiones."""
    limpio = quitar_acentos(texto).lower()
    limpio = re.sub(r"[^a-z0-9\s-]", "", limpio)
    return re.sub(r"\s+", " ", limpio).strip()


def slugify(texto: str) -> str:
    """'Dragon Ball Z' -> 'dragon-ball-z'."""
    return re.sub(r"[^a-z0-9]+", "-", quitar_acentos(texto).lower()).strip("-")
