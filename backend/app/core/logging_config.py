"""
BrainMind — Logging estructurado y trazas.

Configura logging JSON en producción y legible en desarrollo.
Añade Request-ID a cada petición para trazabilidad end-to-end.
"""
import logging
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# ── Formatter JSON ─────────────────────────────────────────────────────────────

class JsonFormatter(logging.Formatter):
    """Emite cada log como una línea JSON. Ideal para Loki / CloudWatch / Datadog."""

    LEVEL_MAP = {
        logging.DEBUG:    "debug",
        logging.INFO:     "info",
        logging.WARNING:  "warning",
        logging.ERROR:    "error",
        logging.CRITICAL: "critical",
    }

    def format(self, record: logging.LogRecord) -> str:
        log: dict = {
            "ts":      datetime.now(timezone.utc).isoformat(),
            "level":   self.LEVEL_MAP.get(record.levelno, "info"),
            "logger":  record.name,
            "msg":     record.getMessage(),
        }
        # Campos extra que se pueden pasar con extra={...}
        for key in ("request_id", "method", "path", "status_code",
                    "duration_ms", "user_id", "error"):
            if hasattr(record, key):
                log[key] = getattr(record, key)

        if record.exc_info:
            log["exc"] = self.formatException(record.exc_info)

        return json.dumps(log, ensure_ascii=False)


class DevFormatter(logging.Formatter):
    """Formato legible para desarrollo."""
    COLORS = {
        "DEBUG":    "\033[36m",
        "INFO":     "\033[32m",
        "WARNING":  "\033[33m",
        "ERROR":    "\033[31m",
        "CRITICAL": "\033[35m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color  = self.COLORS.get(record.levelname, "")
        prefix = f"{color}[{record.levelname[0]}]{self.RESET}"
        ts     = datetime.now().strftime("%H:%M:%S")
        extra  = ""
        for key in ("request_id", "status_code", "duration_ms", "user_id"):
            if hasattr(record, key):
                extra += f" {key}={getattr(record, key)}"
        return f"{ts} {prefix} {record.name}: {record.getMessage()}{extra}"


# ── Setup ──────────────────────────────────────────────────────────────────────

def setup_logging(environment: str = "development") -> None:
    """Llama una vez al arrancar la app."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Evitar duplicar handlers si se llama varias veces
    if root.handlers:
        root.handlers.clear()

    handler = logging.StreamHandler()
    if environment == "production":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(DevFormatter())

    root.addHandler(handler)

    # Silenciar librerías muy verbosas
    for noisy in ("uvicorn.access", "httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger("brainmind").setLevel(logging.DEBUG)


# ── Middleware de request tracing ──────────────────────────────────────────────

class RequestTracingMiddleware(BaseHTTPMiddleware):
    """
    Para cada request:
      - Genera un X-Request-ID único
      - Loguea inicio y fin con duración
      - Propaga el request_id a los logs de la petición
    """

    logger = logging.getLogger("brainmind.http")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        start = time.perf_counter()

        # Log de entrada (solo rutas no-triviales)
        if not request.url.path.startswith(("/health", "/docs", "/openapi")):
            self.logger.info(
                f"→ {request.method} {request.url.path}",
                extra={"request_id": request_id, "method": request.method, "path": request.url.path},
            )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration = round((time.perf_counter() - start) * 1000)
            self.logger.error(
                f"✗ {request.method} {request.url.path} — unhandled exception",
                extra={
                    "request_id": request_id,
                    "method":     request.method,
                    "path":       request.url.path,
                    "duration_ms": duration,
                    "error":      str(exc),
                },
                exc_info=True,
            )
            raise

        duration = round((time.perf_counter() - start) * 1000)

        if not request.url.path.startswith(("/health", "/docs", "/openapi")):
            level = logging.WARNING if response.status_code >= 400 else logging.INFO
            self.logger.log(
                level,
                f"← {request.method} {request.url.path} {response.status_code} ({duration}ms)",
                extra={
                    "request_id":  request_id,
                    "method":      request.method,
                    "path":        request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration,
                },
            )

        response.headers["X-Request-ID"] = request_id
        return response
