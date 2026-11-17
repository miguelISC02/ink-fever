"""Modelos de entrada y salida de la API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.texto import normalizar_etiqueta

TipoPrenda = Literal["playera", "sudadera"]


# ---------- Autenticación ----------
class LoginEntrada(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class TokenSalida(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expira_en_minutos: int


class AdminSalida(BaseModel):
    id: int
    email: str
    nombre: str


# ---------- Categorías ----------
class CategoriaEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=60)
    orden: int = Field(0, ge=0, le=999)
    activa: bool = True

    @field_validator("nombre")
    @classmethod
    def _limpiar_nombre(cls, valor: str) -> str:
        return " ".join(valor.split())


class CategoriaSalida(CategoriaEntrada):
    id: int
    slug: str


# ---------- Prendas ----------
class PrendaEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    descripcion: str | None = Field(None, max_length=1000)
    tipo: TipoPrenda
    categoria_id: int | None = None
    visible: bool = True
    etiquetas: list[str] = Field(default_factory=list, max_length=20)
    imagenes: list[str] = Field(
        min_length=1,
        max_length=8,
        description="public_id de Cloudinary en orden. La primera es la imagen principal.",
    )

    @field_validator("nombre")
    @classmethod
    def _limpiar_nombre(cls, valor: str) -> str:
        return " ".join(valor.split())

    @field_validator("descripcion")
    @classmethod
    def _limpiar_descripcion(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        valor = valor.strip()
        return valor or None

    @field_validator("etiquetas")
    @classmethod
    def _normalizar_etiquetas(cls, valores: list[str]) -> list[str]:
        limpias: list[str] = []
        for valor in valores:
            etiqueta = normalizar_etiqueta(valor)
            if len(etiqueta) > 40:
                raise ValueError("Cada etiqueta debe tener máximo 40 caracteres")
            if etiqueta and etiqueta not in limpias:
                limpias.append(etiqueta)
        return limpias

    @field_validator("imagenes")
    @classmethod
    def _sin_repetidas(cls, valores: list[str]) -> list[str]:
        if len(set(valores)) != len(valores):
            raise ValueError("Hay imágenes repetidas")
        return valores


class VisibilidadEntrada(BaseModel):
    visible: bool


class ImagenSalida(BaseModel):
    public_id: str
    url: str


class PrendaSalida(BaseModel):
    id: int
    nombre: str
    descripcion: str | None
    tipo: TipoPrenda
    visible: bool
    creado_en: datetime
    categoria_id: int | None
    categoria: str | None
    categoria_slug: str | None
    etiquetas: list[str]
    imagenes: list[ImagenSalida]


class PaginaPrendas(BaseModel):
    pagina: int
    hay_mas: bool
    resultados: list[PrendaSalida]


# ---------- Etiquetas ----------
class EtiquetaSalida(BaseModel):
    nombre: str
    usos: int


# ---------- Cloudinary ----------
class FirmaSubida(BaseModel):
    url_subida: str
    parametros: dict[str, str | int]
