from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Бит.Serves"
    SECRET_KEY: str = "change-me-in-production-please-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    DATABASE_URL: str = "sqlite:///./data/bitserves.db"
    CORS_ORIGINS: str = "*"

    HEAD_REGISTER_PASSWORD: str = "123456789"

    OFFICE_COST_PER_EMPLOYEE: float = 45000.0
    INSURANCE_RATE_PERCENT: float = 7.6
    VAT_RATE_PERCENT: float = 5.0
    NDFL_RATE_PERCENT: float = 13.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()