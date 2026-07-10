from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/jarvis"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    sync_agent_api_key: str = "change-me-sync-agent-key"
    openai_api_key: str = ""
    default_user_email: str = "me@example.com"
    cors_origins: str = "http://localhost:3000"
    environment: str = "development"
    openai_model: str = "gpt-4o"
    openai_embedding_model: str = "text-embedding-3-small"
    meal_confidence_threshold: float = 0.75

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
