"""
Router de IA clínica — /api/ai/...

Endpoints:
  POST /ai/sessions/{appointment_id}/upload-audio   → sube audio, lanza Whisper en background
  GET  /ai/sessions/{appointment_id}/transcript     → estado + texto de la transcripción
  POST /ai/sessions/{appointment_id}/generate-soap  → genera resumen SOAP con LLM + RAG
  GET  /ai/sessions/{appointment_id}/summary        → obtener resumen existente
  POST /ai/sessions/{appointment_id}/exercise-plan  → genera ejercicios entre sesiones
  GET  /ai/sessions/{appointment_id}/exercise-plan  → obtener plan de ejercicios
  PATCH /ai/exercise-plans/{plan_id}/acknowledge    → paciente confirma que vio el plan
  GET  /ai/patients/{patient_id}/history            → historial resumido del paciente
"""
import os
import logging
import uuid as uuid_mod
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist
from app.core.config import get_settings
from app.models.user import User, Appointment, PatientProfile, PsychologistProfile
from app.models.ai_models import SessionTranscript, SessionSummary, ExercisePlan, TranscriptStatus
from app.schemas.ai_schemas import (
    TranscriptOut, TranscriptStatusResponse,
    SummaryOut, ExercisePlanOut, AcknowledgeRequest,
)
from app.services.whisper_service import transcribe_audio
from app.services.llm_service import generate_soap_summary, generate_exercise_plan
from app.services.qdrant_service import index_summary, ensure_collection
from sqlalchemy import text as sql_text

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)
settings = get_settings()

AUDIO_DIR = "/app/uploads/audio"
ALLOWED_AUDIO_TYPES = {"audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"}


async def _index_summary_in_qdrant(
    summary_id: str,
    pseudo_token: str,
    appointment_id: str,
    session_number: int,
    session_date: str,
    soap_text: str,
    db: AsyncSession,
) -> None:
    """Background task: indexa el resumen en Qdrant y guarda el point_id en PG."""
    point_id = await index_summary(
        summary_id=summary_id,
        pseudo_token=pseudo_token,
        appointment_id=appointment_id,
        session_number=session_number,
        session_date=session_date,
        soap_text=soap_text,
    )
    if point_id:
        await db.execute(
            sql_text("UPDATE session_summaries SET qdrant_point_id = :pid WHERE id = :id"),
            {"pid": point_id, "id": summary_id},
        )
        await db.commit()


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_appointment_and_check_access(
    appointment_id: str,
    current_user: User,
    db: AsyncSession,
    require_psychologist_role: bool = True,
) -> Appointment:
    """Valida cita y permisos de acceso."""
    result = await db.execute(
        select(Appointment).where(Appointment.id == appointment_id)
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Cita no encontrada")

    if require_psychologist_role and current_user.role != "psychologist":
        raise HTTPException(403, "Solo psicólogos pueden realizar esta acción")

    # Verificar que el usuario pertenece a esta cita
    if current_user.role == "psychologist":
        psych_result = await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
        )
        psych = psych_result.scalar_one_or_none()
        if not psych or psych.id != appt.psychologist_id:
            raise HTTPException(403, "No tienes acceso a esta cita")
    else:
        patient_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient or patient.id != appt.patient_id:
            raise HTTPException(403, "No tienes acceso a esta cita")

    return appt


async def _get_patient_profile(patient_id, db: AsyncSession) -> PatientProfile:
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Perfil de paciente no encontrado")
    return patient


# ─── Background task: transcripción ──────────────────────────────────────────

async def _run_transcription(transcript_id: str, filepath: str):
    """
    Se ejecuta en background tras el upload.
    Actualiza el registro de transcript en BD con el resultado.
    """
    from app.core.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(
            select(SessionTranscript).where(SessionTranscript.id == transcript_id)
        )
        transcript = result.scalar_one_or_none()
        if not transcript:
            return

        transcript.status = TranscriptStatus.processing
        await db.commit()

        try:
            data = await transcribe_audio(filepath)
            transcript.transcript_text = data["text"]
            transcript.language = data.get("language", "es")
            transcript.duration_seconds = data.get("duration_seconds")
            transcript.status = TranscriptStatus.completed
            logger.info(f"Transcripción completada: {transcript_id}")
        except Exception as e:
            transcript.status = TranscriptStatus.failed
            transcript.error_message = str(e)
            logger.error(f"Error en transcripción {transcript_id}: {e}")

        await db.commit()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/sessions/{appointment_id}/upload-audio", status_code=202)
async def upload_session_audio(
    appointment_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """
    Sube el audio de la sesión y lanza la transcripción en background.
    El audio NUNCA sale del servidor — Whisper corre localmente.
    """
    appt = await _get_appointment_and_check_access(appointment_id, current_user, db)

    if appt.status != "completed":
        raise HTTPException(400, "Solo se pueden subir audios de citas completadas")

    # Verificar consentimiento de transcripción
    patient = await _get_patient_profile(appt.patient_id, db)
    if not patient.consent_transcription:
        raise HTTPException(403, "El paciente no ha dado consentimiento para transcripción")

    if file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(400, f"Formato no soportado: {file.content_type}")

    # Guardar archivo
    os.makedirs(AUDIO_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "webm"
    filename = f"{appointment_id}_{uuid_mod.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(AUDIO_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    # Contar número de sesión del paciente
    sessions_result = await db.execute(
        select(SessionTranscript).join(
            Appointment, Appointment.id == SessionTranscript.appointment_id
        ).where(Appointment.patient_id == appt.patient_id)
    )
    session_number = len(sessions_result.scalars().all()) + 1

    # Crear registro de transcript
    transcript = SessionTranscript(
        appointment_id=appt.id,
        audio_filename=filename,
        session_number=session_number,
        status=TranscriptStatus.pending,
    )
    db.add(transcript)
    await db.commit()
    await db.refresh(transcript)

    # Lanzar transcripción asíncrona
    background_tasks.add_task(_run_transcription, str(transcript.id), filepath)

    return {
        "status": "processing",
        "transcript_id": str(transcript.id),
        "appointment_id": appointment_id,
        "whisper_mode": settings.whisper_mode,
        "message": "Audio recibido. La transcripción comenzará en breve.",
    }


@router.get("/sessions/{appointment_id}/transcript", response_model=TranscriptOut | None)
async def get_transcript(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve el estado y contenido de la transcripción."""
    await _get_appointment_and_check_access(appointment_id, current_user, db, require_psychologist_role=False)

    result = await db.execute(
        select(SessionTranscript).where(
            SessionTranscript.appointment_id == appointment_id
        )
    )
    transcript = result.scalar_one_or_none()
    if not transcript:
        return None
    return transcript


@router.post("/sessions/{appointment_id}/generate-soap", response_model=SummaryOut)
async def generate_soap(
    appointment_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """
    Genera resumen SOAP usando LLM (Ollama local o Claude según feature flag).
    Inyecta contexto RAG de sesiones anteriores del mismo paciente.
    """
    appt = await _get_appointment_and_check_access(appointment_id, current_user, db)
    patient = await _get_patient_profile(appt.patient_id, db)

    if not patient.consent_ai_analysis:
        raise HTTPException(403, "El paciente no ha dado consentimiento para análisis IA")

    # Obtener transcripción
    t_result = await db.execute(
        select(SessionTranscript).where(
            SessionTranscript.appointment_id == appointment_id
        )
    )
    transcript = t_result.scalar_one_or_none()
    if not transcript or transcript.status != TranscriptStatus.completed:
        raise HTTPException(400, "La transcripción no está lista aún (status: {})".format(
            transcript.status if transcript else "no encontrada"
        ))

    # Evitar duplicados
    existing_result = await db.execute(
        select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return existing

    # Generar con LLM + RAG
    soap = await generate_soap_summary(
        transcript_text=transcript.transcript_text,
        pseudo_token=patient.pseudo_token,
        session_number=transcript.session_number,
        db=db,
    )

    summary = SessionSummary(
        appointment_id=appt.id,
        transcript_id=transcript.id,
        patient_pseudo_token=patient.pseudo_token,
        llm_provider=soap.get("llm_provider", settings.llm_provider),
        subjective=soap.get("subjective"),
        objective=soap.get("objective"),
        assessment=soap.get("assessment"),
        plan=soap.get("plan"),
        raw_response=soap.get("raw"),
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)

    # Generar embedding en Qdrant en background (no bloquea la respuesta)
    summary_text = f"{soap.get('subjective', '')} {soap.get('assessment', '')} {soap.get('plan', '')}"
    background_tasks.add_task(
        _index_summary_in_qdrant,
        str(summary.id),
        patient.pseudo_token,
        str(appt.id),
        transcript.session_number,
        summary.created_at.isoformat(),
        summary_text,
        db,
    )

    return summary


@router.get("/sessions/{appointment_id}/summary", response_model=SummaryOut | None)
async def get_summary(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene el resumen SOAP de una sesión."""
    await _get_appointment_and_check_access(appointment_id, current_user, db, require_psychologist_role=False)

    result = await db.execute(
        select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
    )
    summary = result.scalar_one_or_none()
    if not summary:
        return None
    return summary


@router.post("/sessions/{appointment_id}/exercise-plan", response_model=ExercisePlanOut)
async def create_exercise_plan(
    appointment_id: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Genera un plan de ejercicios entre sesiones usando LLM + RAG."""
    appt = await _get_appointment_and_check_access(appointment_id, current_user, db)
    patient = await _get_patient_profile(appt.patient_id, db)

    # Necesitamos el resumen SOAP
    s_result = await db.execute(
        select(SessionSummary).where(SessionSummary.appointment_id == appointment_id)
    )
    summary = s_result.scalar_one_or_none()
    if not summary or not summary.plan:
        raise HTTPException(400, "Genera primero el resumen SOAP de la sesión")

    # Evitar duplicados
    existing_result = await db.execute(
        select(ExercisePlan).where(ExercisePlan.appointment_id == appointment_id)
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return existing

    plan_data = await generate_exercise_plan(
        soap_plan=summary.plan,
        presenting_issues=patient.presenting_issues or [],
        pseudo_token=patient.pseudo_token,
        db=db,
    )

    plan = ExercisePlan(
        appointment_id=appt.id,
        patient_id=appt.patient_id,
        summary_id=summary.id,
        llm_provider=plan_data.get("llm_provider", settings.llm_provider),
        exercises=plan_data.get("exercises", []),
        frequency=plan_data.get("frequency"),
        notes=plan_data.get("notes"),
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/sessions/{appointment_id}/exercise-plan", response_model=ExercisePlanOut | None)
async def get_exercise_plan(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene el plan de ejercicios de una sesión."""
    await _get_appointment_and_check_access(appointment_id, current_user, db, require_psychologist_role=False)

    result = await db.execute(
        select(ExercisePlan).where(ExercisePlan.appointment_id == appointment_id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        return None
    return plan


@router.patch("/exercise-plans/{plan_id}/acknowledge", response_model=ExercisePlanOut)
async def acknowledge_exercise_plan(
    plan_id: str,
    data: AcknowledgeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """El paciente confirma que ha visto su plan de ejercicios."""
    result = await db.execute(
        select(ExercisePlan).where(ExercisePlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Plan no encontrado")

    # Solo el paciente dueño puede hacer acknowledge
    if current_user.role == "patient":
        patient_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient or patient.id != plan.patient_id:
            raise HTTPException(403, "No tienes acceso a este plan")

    plan.is_acknowledged = data.acknowledged
    if data.acknowledged:
        plan.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.get("/patients/{patient_id}/history")
async def get_patient_history(
    patient_id: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """
    Devuelve el historial resumido del paciente (para el psicólogo).
    Incluye todas las sesiones con sus resúmenes y ejercicios.
    """
    # Verificar que el psicólogo tiene acceso al paciente
    psych_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
    )
    psych = psych_result.scalar_one_or_none()

    patient = await _get_patient_profile(patient_id, db)

    # Obtener todas las citas con sus summaries
    appts_result = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == patient_id,
            Appointment.psychologist_id == psych.id,
        ).order_by(Appointment.scheduled_at.desc())
    )
    appointments = appts_result.scalars().all()

    history = []
    for appt in appointments:
        s_result = await db.execute(
            select(SessionSummary).where(SessionSummary.appointment_id == appt.id)
        )
        summary = s_result.scalar_one_or_none()

        e_result = await db.execute(
            select(ExercisePlan).where(ExercisePlan.appointment_id == appt.id)
        )
        exercises = e_result.scalar_one_or_none()

        history.append({
            "appointment_id": str(appt.id),
            "scheduled_at": appt.scheduled_at.isoformat(),
            "status": appt.status,
            "has_transcript": False,  # se puede enriquecer
            "summary": {
                "subjective": summary.subjective,
                "objective": summary.objective,
                "assessment": summary.assessment,
                "plan": summary.plan,
                "llm_provider": summary.llm_provider,
            } if summary else None,
            "exercise_plan": {
                "exercises": exercises.exercises,
                "frequency": exercises.frequency,
                "is_acknowledged": exercises.is_acknowledged,
            } if exercises else None,
        })

    return {
        "patient_id": patient_id,
        "total_sessions": len(appointments),
        "history": history,
    }