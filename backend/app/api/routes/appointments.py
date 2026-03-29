import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist
from app.core.config import get_settings
from app.models.user import User, Appointment, Match, PsychologistProfile, PatientProfile
from app.schemas.schemas import AppointmentCreate, AppointmentOut

router = APIRouter(prefix="/appointments", tags=["appointments"])
settings = get_settings()


def _jitsi_room(match_id: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]", "", str(match_id))[:24]
    return f"brainmind-{clean}"


async def _notify(db, user_id, ntype, title, body=None, url=None):
    try:
        from app.services.notification_service import create_notification
        await create_notification(db, str(user_id), ntype, title, body, url)
    except Exception:
        pass


@router.post("/", response_model=AppointmentOut, status_code=201)
async def create_appointment(
    data: AppointmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Match).where(Match.id == data.match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match no encontrado")
    if match.status != "accepted":
        raise HTTPException(status_code=400, detail="El match debe estar aceptado para crear citas")
    if data.scheduled_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="La cita debe ser en el futuro")

    room_name = _jitsi_room(str(match.id))
    video_url = f"{settings.jitsi_base_url}/{room_name}"

    appointment = Appointment(
        match_id=match.id,
        patient_id=match.patient_id,
        psychologist_id=match.psychologist_id,
        scheduled_at=data.scheduled_at,
        duration_min=data.duration_min,
        video_room_url=video_url,
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    psych_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == match.psychologist_id)
    )
    psych = psych_result.scalar_one_or_none()
    if psych:
        date_str = appointment.scheduled_at.strftime('%d/%m/%Y a las %H:%M')
        await _notify(db, psych.user_id, "appointment_created",
                      "Nueva cita solicitada", f"Sesión el {date_str}", "/dashboard/appointments")

    return appointment


@router.get("/my", response_model=list[AppointmentOut])
async def get_my_appointments(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "patient":
        p_result = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
        patient = p_result.scalar_one_or_none()
        if not patient:
            return []
        query = select(Appointment).where(Appointment.patient_id == patient.id)
    else:
        ps_result = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
        psych = ps_result.scalar_one_or_none()
        if not psych:
            return []
        query = select(Appointment).where(Appointment.psychologist_id == psych.id)

    if status:
        query = query.where(Appointment.status == status)
    query = query.order_by(Appointment.scheduled_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    return appointment


@router.patch("/{appointment_id}/confirm", response_model=AppointmentOut)
async def confirm_appointment(
    appointment_id: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    appointment.status = "confirmed"
    await db.commit()
    await db.refresh(appointment)

    # Programar recordatorios automáticos
    try:
        from app.services.reminder_service import schedule_appointment_reminders
        await schedule_appointment_reminders(db, appointment)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"No se pudieron programar recordatorios: {e}")

    p_result = await db.execute(select(PatientProfile).where(PatientProfile.id == appointment.patient_id))
    patient = p_result.scalar_one_or_none()
    if patient:
        date_str = appointment.scheduled_at.strftime('%d/%m/%Y a las %H:%M')
        await _notify(db, patient.user_id, "appointment_confirmed",
                      "Cita confirmada", f"Tu sesión del {date_str} ha sido confirmada.", "/dashboard/appointments")

    return appointment


@router.patch("/{appointment_id}/cancel", response_model=AppointmentOut)
async def cancel_appointment(
    appointment_id: str,
    reason: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    appointment.status = "cancelled"
    appointment.cancellation_reason = reason
    appointment.cancelled_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/complete", response_model=AppointmentOut)
async def complete_appointment(
    appointment_id: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Psicólogo marca la sesión como completada → desbloquea flujo IA."""
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if appointment.status not in ("confirmed", "pending"):
        raise HTTPException(status_code=400, detail=f"No se puede completar una cita en estado '{appointment.status}'")

    appointment.status = "completed"
    await db.commit()
    await db.refresh(appointment)

    ps_result = await db.execute(select(PsychologistProfile).where(PsychologistProfile.id == appointment.psychologist_id))
    psych = ps_result.scalar_one_or_none()
    if psych:
        await _notify(db, psych.user_id, "session_completed",
                      "Sesión completada",
                      "Puedes generar el resumen IA y el plan de ejercicios.",
                      f"/dashboard/session/{appointment_id}")

    return appointment


@router.patch("/{appointment_id}/notes", response_model=AppointmentOut)
async def update_session_notes(
    appointment_id: str,
    notes: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Appointment).where(Appointment.id == appointment_id))
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    appointment.notes_psychologist = notes
    appointment.status = "completed"
    await db.commit()
    await db.refresh(appointment)
    return appointment
