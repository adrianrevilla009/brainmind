from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging_config import setup_logging, RequestTracingMiddleware
from app.api.routes import (
    auth, profiles, matches, appointments,
    payments, ai, notifications, rgpd, analytics, monitoring,
)
from app.core.health import router as health_router

settings = get_settings()

# ── Logging estructurado (primero, antes de todo) ─────────────────────────────
setup_logging(environment=settings.environment)

import logging
logger = logging.getLogger("brainmind.startup")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="BrainMind API",
    description="Plataforma de apoyo psicológico con IA",
    version="0.5.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

# ── Prometheus /metrics ───────────────────────────────────────────────────────
from app.core.telemetry import setup_prometheus
setup_prometheus(app)

# ── OpenTelemetry trazas ──────────────────────────────────────────────────────
from app.core.telemetry import setup_opentelemetry
setup_opentelemetry(app, endpoint=settings.otel_endpoint)

# ── Middlewares ───────────────────────────────────────────────────────────────
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health_router)
app.include_router(auth.router,          prefix="/api")
app.include_router(profiles.router,      prefix="/api")
app.include_router(matches.router,       prefix="/api")
app.include_router(appointments.router,  prefix="/api")
app.include_router(payments.router,      prefix="/api")
app.include_router(ai.router,            prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(rgpd.router,          prefix="/api")
app.include_router(analytics.router,     prefix="/api")
app.include_router(monitoring.router,    prefix="/api")


@app.on_event("startup")
async def startup_event():
    import asyncio
    logger.info("BrainMind API v0.5.0 arrancando...")

    # Qdrant
    try:
        from app.services.qdrant_service import ensure_collection
        await ensure_collection()
        logger.info("Qdrant: colección lista")
    except Exception as e:
        logger.warning(f"Qdrant no disponible en startup: {e}")

    # Scheduler de recordatorios de email
    try:
        from app.services.reminder_service import run_scheduler
        asyncio.create_task(run_scheduler())
        logger.info("Scheduler de recordatorios iniciado")
    except Exception as e:
        logger.warning(f"Scheduler no disponible: {e}")

    # Actualizador de métricas de negocio (Prometheus)
    try:
        from app.core.telemetry import run_metrics_updater
        asyncio.create_task(run_metrics_updater())
        logger.info("Actualizador de métricas de negocio iniciado")
    except Exception as e:
        logger.warning(f"Métricas updater no disponible: {e}")

    logger.info("✓ Startup completo")
