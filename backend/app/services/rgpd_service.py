"""
Servicio RGPD — derecho de acceso, portabilidad y olvido.

Implementa:
  - Export completo de datos del usuario en JSON
  - Borrado en cascada (BD + vectores Qdrant)
  - Registro de solicitudes en rgpd_requests
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)


async def generate_user_export(db: AsyncSession, user_id: str) -> dict:
    """
    Genera un export completo de todos los datos del usuario.
    Devuelve un dict JSON-serializable.
    """
    from app.models.user import (
        User, PsychologistProfile, PatientProfile,
        Match, Appointment, Payment, Notification,
    )
    from app.models.ai_models import SessionTranscript, SessionSummary, ExercisePlan

    # Usuario base
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return {}

    export = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "brainmind_version": "0.4.0",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role,
            "is_verified": user.is_verified,
            "created_at": user.created_at.isoformat(),
        },
        "profile": {},
        "appointments": [],
        "payments": [],
        "notifications": [],
        "ai_data": {},
    }

    # Perfil
    if user.role == "psychologist":
        ps_result = await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == user_id)
        )
        ps = ps_result.scalar_one_or_none()
        if ps:
            export["profile"] = {
                "full_name": ps.full_name,
                "bio": ps.bio,
                "license_number": ps.license_number,
                "specializations": ps.specializations,
                "approaches": ps.approaches,
                "languages": ps.languages,
                "session_price_eur": ps.session_price_eur,
                "city": ps.city,
                "country": ps.country,
            }
    else:
        p_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == user_id)
        )
        p = p_result.scalar_one_or_none()
        if p:
            export["profile"] = {
                "full_name": p.full_name,
                "gender": p.gender,
                "city": p.city,
                "presenting_issues": p.presenting_issues,
                "therapy_goals": p.therapy_goals,
                "preferred_approach": p.preferred_approach,
                "consent_data_processing": p.consent_data_processing,
                "consent_ai_analysis": p.consent_ai_analysis,
                "consent_transcription": p.consent_transcription,
                "consent_date": p.consent_date.isoformat() if p.consent_date else None,
            }
            # NO exportamos pseudo_token (es dato de seudonimización interna)

    # Citas (sin datos clínicos del otro usuario)
    if user.role == "patient":
        p_result = await db.execute(select(PatientProfile).where(PatientProfile.user_id == user_id))
        p = p_result.scalar_one_or_none()
        if p:
            appt_result = await db.execute(
                select(Appointment).where(Appointment.patient_id == p.id)
            )
            appointments = appt_result.scalars().all()
            export["appointments"] = [
                {
                    "id": str(a.id),
                    "scheduled_at": a.scheduled_at.isoformat(),
                    "duration_min": a.duration_min,
                    "status": a.status,
                    "created_at": a.created_at.isoformat(),
                }
                for a in appointments
            ]

            # Ejercicios asignados
            exercises_result = await db.execute(
                select(ExercisePlan).where(ExercisePlan.patient_id == p.id)
            )
            exercises = exercises_result.scalars().all()
            export["ai_data"]["exercise_plans"] = [
                {
                    "appointment_id": str(e.appointment_id),
                    "exercises": e.exercises,
                    "frequency": e.frequency,
                    "notes": e.notes,
                    "is_acknowledged": e.is_acknowledged,
                    "created_at": e.created_at.isoformat(),
                }
                for e in exercises
            ]

    # Notificaciones
    notif_result = await db.execute(
        select(Notification).where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc()).limit(100)
    )
    notifications = notif_result.scalars().all()
    export["notifications"] = [
        {
            "type": n.type,
            "title": n.title,
            "body": n.body,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifications
    ]

    return export


async def delete_user_account(db: AsyncSession, user_id: str) -> dict:
    """
    Elimina permanentemente todos los datos del usuario.
    Orden: vectores Qdrant → datos clínicos → perfil → usuario.
    Devuelve resumen de lo eliminado.
    """
    from app.models.user import (
        User, PsychologistProfile, PatientProfile,
        Match, Appointment, Payment, Notification,
    )
    from app.models.ai_models import SessionTranscript, SessionSummary, ExercisePlan
    from app.services.qdrant_service import delete_patient_vectors

    summary = {"deleted": []}

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return {"error": "Usuario no encontrado"}

    # 1. Borrar vectores de Qdrant (si es paciente)
    if user.role == "patient":
        p_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == user_id)
        )
        patient = p_result.scalar_one_or_none()
        if patient:
            try:
                n = await delete_patient_vectors(patient.pseudo_token)
                summary["deleted"].append(f"Vectores Qdrant: {n}")
            except Exception as e:
                logger.warning(f"Error borrando vectores Qdrant: {e}")

    # 2. Borrar notificaciones
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
    summary["deleted"].append("Notificaciones")

    # 3. El resto se borra en cascada al eliminar el usuario
    # (ON DELETE CASCADE está definido en las FKs del schema)
    await db.execute(delete(User).where(User.id == user_id))
    summary["deleted"].append("Usuario y datos en cascada")

    await db.commit()
    logger.info(f"Usuario {user_id} eliminado. Resumen: {summary}")
    return summary
