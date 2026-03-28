"""
Servicio de analytics clínico.

Extrae métricas de los resúmenes SOAP usando el LLM y las almacena
en session_analytics para mostrar gráficas de evolución del paciente.

Scores (1-10):
  - mood_score: estado anímico percibido
  - anxiety_score: nivel de ansiedad (10 = muy alta)
  - progress_score: progreso terapéutico percibido
"""
import json
import logging
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.services.llm_service import _call_llm

logger = logging.getLogger(__name__)
settings = get_settings()

ANALYTICS_SYSTEM = """Eres un asistente clínico. Analiza el resumen SOAP de una sesión terapéutica
y extrae métricas numéricas objetivas.

Responde ÚNICAMENTE con JSON válido:
{
  "mood_score": 7,
  "anxiety_score": 4,
  "progress_score": 6,
  "key_topics": ["ansiedad laboral", "relaciones familiares"],
  "rationale": "breve explicación de las puntuaciones"
}

Escalas (1-10):
  mood_score: 1=muy bajo, 10=excelente
  anxiety_score: 1=sin ansiedad, 10=crisis severa
  progress_score: 1=sin avance, 10=avance notable

Si no hay suficiente información para una métrica, usa null."""


async def extract_and_store_analytics(
    db: AsyncSession,
    appointment_id: str,
    patient_id: str,
    psychologist_id: str,
    session_number: int,
    session_date: date,
    soap_summary: dict,
    exercise_completion_rate: float | None = None,
) -> None:
    """
    Extrae métricas del SOAP con LLM y las guarda en session_analytics.
    Se llama en background tras generar el resumen SOAP.
    """
    try:
        soap_text = "\n".join([
            f"Subjetivo: {soap_summary.get('subjective', '')}",
            f"Objetivo: {soap_summary.get('objective', '')}",
            f"Evaluación: {soap_summary.get('assessment', '')}",
            f"Plan: {soap_summary.get('plan', '')}",
        ])

        prompt = f"Sesión nº {session_number}\n\nRESUMEN SOAP:\n{soap_text}\n\nExtrae las métricas."

        raw = await _call_llm(ANALYTICS_SYSTEM, prompt)

        # Parsear JSON
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1]).strip()
        metrics = json.loads(cleaned)

        # Guardar en BD
        from app.models.user import SessionAnalytic
        analytic = SessionAnalytic(
            patient_id=patient_id,
            psychologist_id=psychologist_id,
            appointment_id=appointment_id,
            session_number=session_number,
            session_date=session_date,
            mood_score=metrics.get("mood_score"),
            anxiety_score=metrics.get("anxiety_score"),
            progress_score=metrics.get("progress_score"),
            key_topics=metrics.get("key_topics", []),
            exercise_completion_rate=exercise_completion_rate,
        )
        db.add(analytic)
        await db.commit()
        logger.info(f"Analytics guardado para cita {appointment_id}")

    except Exception as e:
        logger.warning(f"Error extrayendo analytics: {e}")


async def get_patient_analytics(
    db: AsyncSession,
    patient_id: str,
    limit: int = 20,
) -> list[dict]:
    """
    Devuelve el historial de métricas de un paciente ordenado por fecha.
    """
    from app.models.user import SessionAnalytic
    result = await db.execute(
        select(SessionAnalytic)
        .where(SessionAnalytic.patient_id == patient_id)
        .order_by(SessionAnalytic.session_date.asc())
        .limit(limit)
    )
    analytics = result.scalars().all()

    return [
        {
            "session_number": a.session_number,
            "session_date": a.session_date.isoformat(),
            "mood_score": a.mood_score,
            "anxiety_score": a.anxiety_score,
            "progress_score": a.progress_score,
            "key_topics": a.key_topics or [],
            "exercise_completion_rate": a.exercise_completion_rate,
        }
        for a in analytics
    ]
