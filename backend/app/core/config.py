from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Literal


class Settings(BaseSettings):
    # Base de datos
    database_url: str = "postgresql://brainmind:brainmind_dev_password@localhost:5432/brainmind"
    redis_url: str = "redis://localhost:6379"

    # Seguridad
    secret_key: str = "dev_secret_key_change_in_production_min_32_chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24h

    # ── LLM FEATURE FLAG ────────────────────────────────────────────────────────
    # 'ollama'  → LLM local gratuito, ideal para dev/pre-prod
    # 'claude'  → Claude API (Anthropic), para producción
    llm_provider: Literal["ollama", "claude"] = "ollama"

    # Ollama (local)
    ollama_base_url: str = "http://ollama:11434"
    ollama_chat_model: str = "mistral:7b"
    ollama_embed_model: str = "nomic-embed-text"  # 768 dims, gratuito

    # Claude API (solo necesario si llm_provider=claude)
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-5"

    # ── WHISPER FEATURE FLAG ─────────────────────────────────────────────────────
    # 'local'  → faster-whisper, transcripción en CPU local, gratuito
    # 'mock'   → devuelve transcript de prueba (para tests sin GPU/CPU pesado)
    whisper_mode: Literal["local", "mock"] = "local"
    whisper_model_size: str = "medium"

    # ── QDRANT (RAG vectorial) ────────────────────────────────────────────────────
    qdrant_url: str = "http://qdrant:6333"

    # RAG
    rag_top_k: int = 3
    rag_chunk_size: int = 1000

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""

    # Email
    resend_api_key: str = ""
    from_email: str = "noreply@brainmind.app"

    # Jitsi (videollamada self-hosted)
    jitsi_base_url: str = "http://localhost:8443"

    # App
    frontend_url: str = "http://localhost:3000"
    environment: str = "development"
    platform_fee_percent: float = 0.05

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
