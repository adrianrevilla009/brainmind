"""
BrainMind — Telemetría completa.

Configura:
  1. Prometheus → prometheus-fastapi-instrumentator + métricas de negocio custom
  2. OpenTelemetry → trazas automáticas de FastAPI, SQLAlchemy, httpx → OTLP → otel-collector → Tempo
"""
import logging
from typing import Optional

from fastapi import FastAPI

logger = logging.getLogger("brainmind.telemetry")

# ── Métricas Prometheus custom (negocio) ───────────────────────────────────────

def _make_business_metrics():
    """Crea gauges y counters de negocio. Se inicializa una sola vez."""
    try:
        from prometheus_client import Gauge, Counter, REGISTRY

        # Comprobar si ya están registradas (hot-reload)
        existing = {m.name for m in REGISTRY.collect()}

        metrics = {}

        def _gauge(name, doc):
            full = f"brainmind_{name}"
            if full not in existing:
                return Gauge(full, doc)
            # Recuperar la métrica ya registrada
            for m in REGISTRY.collect():
                if m.name == full:
                    return m
            return Gauge(full, doc)

        def _counter(name, doc, labels=None):
            full = f"brainmind_{name}"
            if full not in existing:
                return Counter(full, doc, labels or [])
            for m in REGISTRY.collect():
                if m.name == full:
                    return m
            return Counter(full, doc, labels or [])

        metrics["users_total"]               = _gauge("users_total", "Total usuarios registrados")
        metrics["new_users_7d"]              = _gauge("new_users_7d", "Nuevos usuarios últimos 7 días")
        metrics["appointments_total"]        = _gauge("appointments_total", "Total citas")
        metrics["appointments_by_status"]    = Gauge("brainmind_appointments_by_status", "Citas por estado", ["status"]) if "brainmind_appointments_by_status" not in existing else None
        metrics["appointments_completed"]    = _gauge("appointments_completed_total", "Citas completadas")
        metrics["reminders_pending"]         = _gauge("reminders_pending_total", "Recordatorios pendientes")
        metrics["reminders_sent"]            = _gauge("reminders_sent_total", "Recordatorios enviados")
        metrics["reminders_failed"]          = _gauge("reminders_failed_total", "Recordatorios fallidos")

        return metrics
    except Exception as e:
        logger.warning(f"No se pudieron crear métricas Prometheus: {e}")
        return {}


_business_metrics: Optional[dict] = None


async def update_business_metrics() -> None:
    """Actualiza métricas de negocio desde la BD. Se llama cada 60s."""
    global _business_metrics
    if _business_metrics is None:
        _business_metrics = _make_business_metrics()

    if not _business_metrics:
        return

    try:
        from sqlalchemy import text
        from app.core.database import async_session_factory

        async with async_session_factory() as db:
            result = await db.execute(text("""
                SELECT
                    (SELECT COUNT(*) FROM users)                                               AS users_total,
                    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7d')     AS new_users_7d,
                    (SELECT COUNT(*) FROM appointments)                                        AS appts_total,
                    (SELECT COUNT(*) FROM appointments WHERE status = 'pending')               AS appts_pending,
                    (SELECT COUNT(*) FROM appointments WHERE status = 'confirmed')             AS appts_confirmed,
                    (SELECT COUNT(*) FROM appointments WHERE status = 'completed')             AS appts_completed,
                    (SELECT COUNT(*) FROM appointments WHERE status = 'cancelled')             AS appts_cancelled,
                    (SELECT COUNT(*) FROM appointment_reminders WHERE status = 'pending')      AS rem_pending,
                    (SELECT COUNT(*) FROM appointment_reminders WHERE status = 'sent')         AS rem_sent,
                    (SELECT COUNT(*) FROM appointment_reminders WHERE status = 'failed')       AS rem_failed
            """))
            row = result.mappings().one()

        m = _business_metrics
        if m.get("users_total"):         m["users_total"].set(row["users_total"] or 0)
        if m.get("new_users_7d"):        m["new_users_7d"].set(row["new_users_7d"] or 0)
        if m.get("appointments_total"):  m["appointments_total"].set(row["appts_total"] or 0)
        if m.get("appointments_completed"): m["appointments_completed"].set(row["appts_completed"] or 0)
        if m.get("reminders_pending"):   m["reminders_pending"].set(row["rem_pending"] or 0)
        if m.get("reminders_sent"):      m["reminders_sent"].set(row["rem_sent"] or 0)
        if m.get("reminders_failed"):    m["reminders_failed"].set(row["rem_failed"] or 0)

        if m.get("appointments_by_status"):
            for status in ("pending", "confirmed", "completed", "cancelled"):
                m["appointments_by_status"].labels(status=status).set(row[f"appts_{status}"] or 0)

        logger.debug("Métricas de negocio actualizadas")

    except Exception as e:
        logger.warning(f"Error actualizando métricas de negocio: {e}")


async def run_metrics_updater() -> None:
    """Loop que actualiza métricas de negocio cada 60 segundos."""
    import asyncio
    logger.info("Actualizador de métricas de negocio iniciado")
    while True:
        await update_business_metrics()
        await asyncio.sleep(60)


# ── Prometheus HTTP instrumentación ───────────────────────────────────────────

def setup_prometheus(app: FastAPI) -> None:
    """Añade /metrics endpoint con métricas HTTP automáticas."""
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator(
            should_group_status_codes=False,
            should_ignore_untemplated=True,
            excluded_handlers=["/metrics", "/health", "/docs", "/openapi.json"],
        ).instrument(app).expose(app, endpoint="/metrics")
        logger.info("Prometheus /metrics expuesto")
    except ImportError:
        logger.warning("prometheus-fastapi-instrumentator no instalado, /metrics no disponible")


# ── OpenTelemetry — trazas distribuidas ───────────────────────────────────────

def setup_opentelemetry(app: FastAPI, endpoint: str = "http://otel-collector:4317") -> None:
    """
    Instrumentación automática de:
      - FastAPI (todas las rutas)
      - SQLAlchemy (queries SQL)
      - httpx (llamadas externas: Resend, Stripe, Ollama, Qdrant)
    Exporta trazas via OTLP gRPC al otel-collector.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        resource = Resource.create({SERVICE_NAME: "brainmind-api"})
        provider = TracerProvider(resource=resource)

        exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)

        # Instrumentar FastAPI
        FastAPIInstrumentor.instrument_app(
            app,
            tracer_provider=provider,
            excluded_urls="/health,/metrics,/docs,/openapi.json",
        )

        # Instrumentar SQLAlchemy (se engancha al engine existente)
        SQLAlchemyInstrumentor().instrument(tracer_provider=provider)

        # Instrumentar httpx (Resend, Stripe, Ollama...)
        HTTPXClientInstrumentor().instrument(tracer_provider=provider)

        logger.info(f"OpenTelemetry configurado → {endpoint}")

    except ImportError as e:
        logger.warning(f"OpenTelemetry no disponible (faltan dependencias): {e}")
    except Exception as e:
        logger.warning(f"Error configurando OpenTelemetry: {e}")
