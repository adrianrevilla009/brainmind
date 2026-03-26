from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.routes import auth, profiles, matches, appointments, payments, ai, notifications

settings = get_settings()

app = FastAPI(
    title="BrainMind API",
    description="Plataforma de apoyo psicológico con IA",
    version="0.2.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(matches.router, prefix="/api")
app.include_router(appointments.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    """Inicializa colecciones Qdrant al arrancar."""
    try:
        from app.services.qdrant_service import ensure_collection
        await ensure_collection()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Qdrant no disponible en startup: {e}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "llm_provider": settings.llm_provider,
        "whisper_mode": settings.whisper_mode,
    }
