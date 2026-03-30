from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Literal


class Settings(BaseSettings):
    database_url: str = "postgresql://brainmind:brainmind_dev_password@localhost:5432/brainmind"
    redis_url: str = "redis://localhost:6379"
    secret_key: str = "dev_secret_key_change_in_production_min_32_chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    llm_provider: Literal["ollama", "claude"] = "ollama"
    ollama_base_url: str = "http://ollama:11434"
    ollama_chat_model: str = "mistral:7b"
    ollama_embed_model: str = "nomic-embed-text"
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-5"

    whisper_mode: Literal["local", "mock"] = "local"
    whisper_model_size: str = "medium"

    qdrant_url: str = "http://qdrant:6333"
    rag_top_k: int = 3
    rag_chunk_size: int = 1000

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""
    stripe_pro_price_id: str = ""      # price_xxx de Stripe para plan Pro
    stripe_clinic_price_id: str = ""   # price_xxx de Stripe para plan Clínica

    # Email
    resend_api_key: str = ""
    from_email: str = "noreply@brainmind.app"

    # Jitsi
    jitsi_base_url: str = "http://localhost:8443"

    # App
    frontend_url: str = "http://localhost:3000"
    environment: str = "development"
    platform_fee_percent: float = 0.05

    # Observabilidad
    otel_endpoint: str = "http://otel-collector:4317"

    # Web Push (VAPID)
    # Generar con: python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.private_key, v.public_key)"
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_email: str = "mailto:admin@brainmind.app"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
