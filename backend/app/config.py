"""Configuración de la app leída de variables de entorno (o del archivo .env)."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_minutos_expiracion: int = Field(480, ge=5, le=1440)

    cloudinary_cloud_name: str
    cloudinary_api_key: str
    cloudinary_api_secret: str
    cloudinary_carpeta: str = "ink-fever"

    cors_origenes: list[str] = ["http://localhost:5500"]
    mostrar_docs: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
