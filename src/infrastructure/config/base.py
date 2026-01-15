

import os
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class AppConfig(BaseSettings):
    app_env: str = "development"
    debug: bool = True
    log_level: str = "INFO"
    secret_key: str = "dev-secret-key"

    fastapi_port: int = 8000
    fastapi_host: str = "127.0.0.1"
    flask_port: int = 5001
    flask_host: str = "127.0.0.1"
    frontend_port: int = 3000


    db_host: str = "localhost"
    db_port: int = 3306
    db_name: str = "prompt_optimizer"
    db_user: str = "root"
    db_password: str = "root"
    db_charset: str = "utf8mb4"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle: int = 3600
    db_pool_name: str = "prompt_pool"


    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    default_model_name: str = "gpt-3.5-turbo"
    api_timeout: int = 30
    api_retry_count: int = 3


    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    jwt_secret_key: str = ""
    jwt_expire_hours: int = 24


    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    cache_expire_time: int = 3600


    max_upload_size: int = 10
    upload_path: str = "./uploads"
    static_path: str = "./static"


    enable_monitoring: bool = True
    log_file_path: str = "./logs/app.log"
    log_max_size: int = 100
    log_backup_count: int = 5


    hot_reload: bool = True
    enable_docs: bool = True
    docs_url: str = "/docs"
    testing_mode: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("app_env")
    @classmethod
    def validate_app_env(cls, v):
        allowed_envs = ["development", "production", "testing"]
        if v not in allowed_envs:
            raise ValueError(f"app_env must be one of {allowed_envs}")
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v):
        allowed_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in allowed_levels:
            raise ValueError(f"log_level must be one of {allowed_levels}")
        return v.upper()

    @field_validator(
        "db_port",
        "fastapi_port",
        "flask_port",
        "frontend_port",
        "redis_port",
    )
    @classmethod
    def validate_port(cls, v):
        if not (1 <= v <= 65535):
            raise ValueError("Port must be between 1 and 65535")
        return v

    @field_validator("db_pool_size")
    @classmethod
    def validate_pool_size(cls, v):
        if not (1 <= v <= 100):
            raise ValueError("Database pool size must be between 1 and 100")
        return v

    @field_validator("api_timeout", "api_retry_count")
    @classmethod
    def validate_positive_int(cls, v):
        if v <= 0:
            raise ValueError("Value must be positive")
        return v

    @property
    def database_url(self) -> str:
        return f"mysql+pymysql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}?charset={self.db_charset}"

    @property
    def cors_origins_list(self) -> List[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_testing(self) -> bool:
        return self.app_env == "testing"

    def validate_required_fields(self) -> dict:
        errors = []
        warnings = []

        if self.is_production:
            if self.secret_key == "dev-secret-key":
                errors.append("SECRET_KEY must be set in production")
            if not self.jwt_secret_key:
                errors.append("JWT_SECRET_KEY must be set in production")
            if self.debug:
                warnings.append("DEBUG should be False in production")

        if not self.openai_api_key and not self.testing_mode:
            warnings.append("OPENAI_API_KEY is not set, AI services may not work")

        return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


@lru_cache()
def get_config() -> AppConfig:
    return AppConfig()


def create_directories():
    config = get_config()

    directories = [
        config.upload_path,
        config.static_path,
        os.path.dirname(config.log_file_path),
    ]

    for directory in directories:
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)


create_directories()
