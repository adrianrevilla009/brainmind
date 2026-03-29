"""
Health checks detallados para monitoring externo (UptimeRobot, Grafana, etc.)

GET /health        → rápido (load balancer liveness)
GET /health/detail → completo (dependencias, latencias)
"""
import time
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

logger = logging.getLogger("brainmind.health")

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_liveness():
    """Liveness probe — respuesta inmediata."""
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@router.get("/health/detail")
async def health_detail():
    """
    Readiness probe completo.
    Comprueba: PostgreSQL · Redis · Qdrant · Ollama (si configurado)
    """
    from app.core.config import get_settings
    settings = get_settings()

    checks: dict = {}
    overall = "ok"

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    try:
        from app.core.database import async_session_factory
        t0 = time.perf_counter()
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        checks["postgres"] = {"status": "ok", "latency_ms": round((time.perf_counter() - t0) * 1000)}
    except Exception as e:
        checks["postgres"] = {"status": "error", "error": str(e)}
        overall = "degraded"

    # ── Redis ─────────────────────────────────────────────────────────────────
    try:
        import redis.asyncio as aioredis
        t0 = time.perf_counter()
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = {"status": "ok", "latency_ms": round((time.perf_counter() - t0) * 1000)}
    except Exception as e:
        checks["redis"] = {"status": "error", "error": str(e)}
        overall = "degraded"

    # ── Qdrant ────────────────────────────────────────────────────────────────
    try:
        import httpx
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{settings.qdrant_url}/healthz")
        checks["qdrant"] = {
            "status": "ok" if resp.status_code == 200 else "error",
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }
    except Exception as e:
        checks["qdrant"] = {"status": "error", "error": str(e)}
        overall = "degraded"

    # ── Ollama (solo si llm_provider=ollama) ─────────────────────────────────
    if settings.llm_provider == "ollama":
        try:
            import httpx
            t0 = time.perf_counter()
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            checks["ollama"] = {
                "status": "ok" if resp.status_code == 200 else "error",
                "latency_ms": round((time.perf_counter() - t0) * 1000),
            }
        except Exception as e:
            checks["ollama"] = {"status": "warning", "error": str(e)}
            if overall == "ok":
                overall = "degraded"

    result = {
        "status":  overall,
        "version": "0.5.0",
        "ts":      datetime.now(timezone.utc).isoformat(),
        "env":     settings.environment,
        "checks":  checks,
    }

    if overall != "ok":
        logger.warning(f"Health check degraded: {checks}")

    return result
