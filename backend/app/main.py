from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging_config import setup_logging, RequestTracingMiddleware
from app.api.routes import (
    auth, profiles, matches, appointments,
    payments, ai, notifications, rgpd, analytics, monitoring,
    chat, reviews, subscription, push,
)
from app.core.health import router as health_router

settings = get_settings()
setup_logging(environment=settings.environment)

import logging
logger = logging.getLogger("brainmind.startup")

app = FastAPI(
    title="BrainMind API",
    description="Plataforma de apoyo psicológico con IA",
    version="0.6.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

from app.core.telemetry import setup_prometheus, setup_opentelemetry
setup_prometheus(app)
setup_opentelemetry(app, endpoint=settings.otel_endpoint)

app.add_middleware(RequestTracingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(chat.router,          prefix="/api")
app.include_router(reviews.router,       prefix="/api")
app.include_router(subscription.router,  prefix="/api")
app.include_router(push.router,          prefix="/api")


@app.on_event("startup")
async def startup_event():
    import asyncio
    logger.info("BrainMind API v0.6.0 arrancando...")
    try:
        from app.services.qdrant_service import ensure_collection
        await ensure_collection()
    except Exception as e:
        logger.warning(f"Qdrant no disponible: {e}")
    try:
        from app.services.reminder_service import run_scheduler
        asyncio.create_task(run_scheduler())
    except Exception as e:
        logger.warning(f"Scheduler no disponible: {e}")
    try:
        from app.core.telemetry import run_metrics_updater
        asyncio.create_task(run_metrics_updater())
    except Exception as e:
        logger.warning(f"Métricas updater no disponible: {e}")
    logger.info("✓ Startup completo v0.6.0")
