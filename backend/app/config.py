from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://simonizer:password@db:5432/simonizer"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    admin_username: str = "simon"
    admin_password: str = "change-me-in-production"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
