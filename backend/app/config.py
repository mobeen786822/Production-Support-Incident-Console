from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Production Support Incident Console"
    database_url: str = Field(default="sqlite:///./incident_console.db", alias="DATABASE_URL")
    jwt_secret: str = Field(default="dev-secret-change-me", alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    token_expiry_minutes: int = 8 * 60
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()