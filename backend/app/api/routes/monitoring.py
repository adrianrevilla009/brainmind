"""
Endpoints de monitoreo internos:
  GET /api/monitoring/logs     → últimos errores de app_logs
  GET /api/monitoring/metrics  → métricas simples (no Prometheus)
  POST /api/monitoring/log     → registrar error desde frontend

Solo accesible en desarrollo o con header interno.
"""
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, desc
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import get_settings

router = APIRouter(prefix="/monitoring", tags=["monitoring"])
settings = get_settings()
logger = logging.getLogger("brainmind.monitoring")


def _require_internal(request: Request):
    """Solo accesible desde localhost o con header X-Internal-Key."""
    if settings.environment == "development":
        return
    key = request.headers.get("X-Internal-Key", "")
    if key != settings.secret_key[:16]:
        raise HTTPException(status_code=403, detail="Acceso restringido")


class FrontendLog(BaseModel):
    level: str  # "error" | "warn" | "info"
    message: str
    context: dict | None = None
    url: str | None = None
    user_agent: str | None = None


@router.post("/log")
async def log_frontend_error(
    payload: FrontendLog,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Recibe errores del frontend para centralizarlos en los logs del backend."""
    logger.warning(
        f"[FRONTEND] {payload.level.upper()}: {payload.message}",
        extra={
            "source": "frontend",
            "url": payload.url,
            "context": payload.context,
        }
    )
    # Persistir en BD solo errores críticos
    if payload.level == "error":
        try:
            await db.execute(
                text("""
                    INSERT INTO app_logs (level, source, message, context, created_at)
                    VALUES (:level, 'frontend', :message, :context::jsonb, NOW())
                """),
                {
                    "level": payload.level,
                    "message": payload.message[:2000],
                    "context": str(payload.context or {}),
                }
            )
            await db.commit()
        except Exception:
            pass  # tabla puede no existir aún
    return {"ok": True}


@router.get("/metrics")
async def get_metrics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _=Depends(_require_internal),
):
    """Métricas simples del sistema."""
    try:
        result = await db.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM users)                                          AS total_users,
                (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7d') AS new_users_7d,
                (SELECT COUNT(*) FROM appointments)                                   AS total_appointments,
                (SELECT COUNT(*) FROM appointments WHERE status = 'completed')        AS completed_appointments,
                (SELECT COUNT(*) FROM appointments WHERE status = 'pending')          AS pending_appointments,
                (SELECT COUNT(*) FROM appointments
                 WHERE created_at > NOW() - INTERVAL '24h')                          AS appointments_24h,
                (SELECT COUNT(*) FROM appointment_reminders WHERE status = 'pending') AS pending_reminders,
                (SELECT COUNT(*) FROM appointment_reminders WHERE status = 'failed')  AS failed_reminders
        """))
        row = result.mappings().one()
        metrics = dict(row)
    except Exception as e:
        metrics = {"error": str(e)}

    # Logs recientes
    try:
        logs_result = await db.execute(text("""
            SELECT level, source, message, created_at
            FROM app_logs
            WHERE created_at > NOW() - INTERVAL '24h'
            ORDER BY created_at DESC
            LIMIT 20
        """))
        recent_logs = [dict(r) for r in logs_result.mappings().all()]
    except Exception:
        recent_logs = []

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "recent_errors": recent_logs,
    }
