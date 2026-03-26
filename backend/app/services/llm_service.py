"""
Servicio LLM unificado.

Feature flag settings.llm_provider:
  'ollama'  → mistral:7b local vía Ollama  (dev/pre-prod, gratuito)
  'claude'  → Claude API Anthropic          (producción)

RAG: recupera contexto de sesiones anteriores desde Qdrant,
     filtrando siempre por pseudo_token (aislamiento RGPD).
"""
import json
import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.core.config import get_settings
from app.services.qdrant_service import search_patient_context

logger = logging.getLogger(__name__)
settings = get_settings()


# ─── Prompts ──────────────────────────────────────────────────────────────────

SOAP_SYSTEM = """Eres un asistente clínico de apoyo a psicólogos.
Recibirás la transcripción anonimizada de una sesión terapéutica y,
si están disponibles, resúmenes de sesiones anteriores del mismo paciente como contexto.
El paciente está identificado solo por un token opaco (nunca nombre ni datos reales).

Genera un resumen clínico en formato SOAP en español.
Responde ÚNICAMENTE con un objeto JSON válido con exactamente estas claves:
  "subjective"  - Lo que el paciente reporta (síntomas, emociones, preocupaciones)
  "objective"   - Observaciones clínicas durante la sesión
  "assessment"  - Evaluación clínica e interpretación
  "plan"        - Plan de intervención y próximos pasos

Sin texto adicional. Sin bloques markdown. Solo el JSON."""

EXERCISE_SYSTEM = """Eres un asistente clínico de apoyo a psicólogos.
Basándote en el plan SOAP de la última sesión y los problemas presentados,
genera un plan de ejercicios terapéuticos concretos para practicar entre sesiones.

Responde ÚNICAMENTE con un JSON válido:
{
  "exercises": [
    {
      "title": "Nombre del ejercicio",
      "description": "Instrucciones detalladas paso a paso",
      "frequency": "ej: 2 veces al día, 10 minutos",
      "duration_min": 10
    }
  ],
  "frequency": "Resumen de frecuencia general del plan",
  "notes": "Notas adicionales para el psicólogo o el paciente"
}

Basa los ejercicios en evidencia clínica (TCC, mindfulness, ACT, psicoeducación).
Máximo 4 ejercicios. Sin texto adicional. Solo el JSON."""


# ─── RAG: contexto previo del paciente ───────────────────────────────────────

async def _build_rag_context(
    pseudo_token: str,
    query_text: str,
    db: AsyncSession,
) -> str:
    """
    Recupera resúmenes similares de Qdrant y los formatea como contexto.
    Fallback: últimos N resúmenes por fecha desde PostgreSQL si Qdrant falla.
    """
    # Intentar búsqueda vectorial en Qdrant
    hits = await search_patient_context(
        pseudo_token=pseudo_token,
        query_text=query_text,
        top_k=settings.rag_top_k,
    )

    if hits:
        # Tenemos IDs de Qdrant → traer texto de PostgreSQL
        appointment_ids = [h.get("appointment_id") for h in hits if h.get("appointment_id")]
        if appointment_ids:
            from app.models.ai_models import SessionSummary
            rows = await db.execute(
                select(SessionSummary).where(
                    SessionSummary.appointment_id.in_(appointment_ids)
                ).order_by(SessionSummary.created_at.desc())
            )
            summaries = rows.scalars().all()
        else:
            summaries = []
    else:
        # Fallback: últimas sesiones por fecha
        from app.models.ai_models import SessionSummary
        rows = await db.execute(
            select(SessionSummary)
            .where(SessionSummary.patient_pseudo_token == pseudo_token)
            .order_by(SessionSummary.created_at.desc())
            .limit(settings.rag_top_k)
        )
        summaries = rows.scalars().all()

    if not summaries:
        return ""

    parts = []
    for s in summaries:
        date_str = s.created_at.strftime("%d/%m/%Y") if s.created_at else "—"
        parts.append(
            f"[Sesión {date_str}]\n"
            f"Subjetivo: {s.subjective or '—'}\n"
            f"Evaluación: {s.assessment or '—'}\n"
            f"Plan: {s.plan or '—'}"
        )

    return "\n\n".join(parts)


# ─── Llamadas al LLM ─────────────────────────────────────────────────────────

async def _call_ollama(system: str, user_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_chat_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user_prompt},
                ],
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 1200},
            },
        )
        resp.raise_for_status()
        return resp.json()["message"]["content"]


async def _call_claude(system: str, user_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.claude_model,
                "max_tokens": 1500,
                "system": system,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]


async def _call_llm(system: str, user_prompt: str) -> str:
    """Router: selecciona backend según feature flag."""
    logger.info(f"LLM call → provider={settings.llm_provider}, model={settings.ollama_chat_model if settings.llm_provider == 'ollama' else settings.claude_model}")
    if settings.llm_provider == "claude":
        return await _call_claude(system, user_prompt)
    return await _call_ollama(system, user_prompt)


def _parse_json(raw: str) -> dict:
    """Parsea JSON tolerando bloques markdown que Ollama a veces añade."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Eliminar primera y última línea (``` o ```json)
        cleaned = "\n".join(lines[1:-1]).strip()
    return json.loads(cleaned)


# ─── API pública ──────────────────────────────────────────────────────────────

async def generate_soap_summary(
    transcript_text: str,
    pseudo_token: str,
    session_number: int,
    db: AsyncSession,
) -> dict:
    """
    Genera resumen SOAP con contexto RAG de sesiones anteriores (Qdrant).
    """
    context = await _build_rag_context(
        pseudo_token=pseudo_token,
        query_text=transcript_text[:500],
        db=db,
    )

    context_block = (
        f"\n\nCONTEXTO DE SESIONES ANTERIORES (mismo paciente, token {pseudo_token[:8]}...):\n"
        f"{context}\n"
    ) if context else ""

    prompt = (
        f"Token paciente: {pseudo_token}\n"
        f"Sesión nº: {session_number}\n"
        f"{context_block}\n"
        f"TRANSCRIPCIÓN ACTUAL:\n{transcript_text[:6000]}\n\n"
        f"Genera el resumen SOAP."
    )

    raw = await _call_llm(SOAP_SYSTEM, prompt)
    parsed = _parse_json(raw)
    parsed["raw"] = raw
    parsed["llm_provider"] = settings.llm_provider
    return parsed


async def generate_exercise_plan(
    soap_plan: str,
    presenting_issues: list[str],
    pseudo_token: str,
    db: AsyncSession,
) -> dict:
    """
    Genera plan de ejercicios con contexto RAG.
    """
    context = await _build_rag_context(
        pseudo_token=pseudo_token,
        query_text=soap_plan,
        db=db,
    )

    context_block = f"\nCONTEXTO PREVIO:\n{context}\n" if context else ""

    prompt = (
        f"Token paciente: {pseudo_token}\n"
        f"Problemas presentados: {', '.join(presenting_issues) or 'No especificados'}\n"
        f"{context_block}\n"
        f"PLAN SOAP ÚLTIMA SESIÓN:\n{soap_plan}\n\n"
        f"Genera el plan de ejercicios."
    )

    raw = await _call_llm(EXERCISE_SYSTEM, prompt)
    parsed = _parse_json(raw)
    parsed["llm_provider"] = settings.llm_provider
    return parsed
