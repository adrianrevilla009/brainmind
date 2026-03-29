"""
Scheduler de recordatorios de email.

Corre como background task al arrancar FastAPI.
Cada minuto comprueba si hay recordatorios pendientes y los envía.

Recordatorios generados al confirmar una cita:
  - 24h antes → paciente + psicólogo
  - 1h antes  → paciente + psicólogo
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.user import (
    Notification, User,
    Appointment, PsychologistProfile, PatientProfile,
)
from app.services.email_service import send_appointment_reminder

logger = logging.getLogger(__name__)


async def schedule_appointment_reminders(
    db: AsyncSession,
    appointment: Appointment,
) -> None:
    """
    Crea los recordatorios pendientes al confirmar una cita.
    Se llama desde el endpoint /appointments/{id}/confirm.
    """
    from app.models.user import AppointmentReminder  # evitar import circular

    scheduled = appointment.scheduled_at

    reminders = [
        {
            "reminder_type": "24h_before",
            "scheduled_for": scheduled - timedelta(hours=24),
        },
        {
            "reminder_type": "1h_before",
            "scheduled_for": scheduled - timedelta(hours=1),
        },
    ]

    # Obtener user_ids de paciente y psicólogo
    p_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == appointment.patient_id)
    )
    patient = p_result.scalar_one_or_none()

    ps_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == appointment.psychologist_id)
    )
    psych = ps_result.scalar_one_or_none()

    if not patient or not psych:
        return

    for r in reminders:
        # Solo programar si la fecha es futura
        if r["scheduled_for"] <= datetime.now(timezone.utc):
            continue

        for user_id in [patient.user_id, psych.user_id]:
            try:
                reminder = AppointmentReminder(
                    appointment_id=appointment.id,
                    user_id=user_id,
                    reminder_type=r["reminder_type"],
                    scheduled_for=r["scheduled_for"],
                    status=ReminderStatus.pending,
                )
                db.add(reminder)
            except Exception:
                pass  # tabla puede no existir en migración anterior

    try:
        await db.commit()
    except Exception as e:
        logger.warning(f"No se pudieron crear recordatorios: {e}")


async def process_pending_reminders() -> None:
    """
    Comprueba y envía recordatorios pendientes.
    Se ejecuta cada 60 segundos.
    """
    try:
        from app.models.user import AppointmentReminder
    except ImportError:
        return

    async with async_session_factory() as db:
        try:
            from app.models.user import ReminderStatus
            now = datetime.now(timezone.utc)

            # Buscar recordatorios pendientes cuya hora ya ha llegado
            result = await db.execute(
                select(AppointmentReminder).where(
                    AppointmentReminder.status == ReminderStatus.pending,
                    AppointmentReminder.scheduled_for <= now,
                ).limit(50)
            )
            reminders = result.scalars().all()

            for reminder in reminders:
                try:
                    await _send_reminder(db, reminder)
                    reminder.status = ReminderStatus.sent
                    reminder.sent_at = now
                except Exception as e:
                    reminder.status = ReminderStatus.failed
                    reminder.error_message = str(e)
                    logger.error(f"Error enviando recordatorio {reminder.id}: {e}")

            if reminders:
                await db.commit()
                logger.info(f"Procesados {len(reminders)} recordatorios")

        except Exception as e:
            logger.error(f"Error en scheduler de recordatorios: {e}")


async def _send_reminder(db: AsyncSession, reminder) -> None:
    """Envía un recordatorio de email para una cita."""
    # Obtener datos de la cita
    appt_result = await db.execute(
        select(Appointment).where(Appointment.id == reminder.appointment_id)
    )
    appt = appt_result.scalar_one_or_none()
    if not appt or appt.status == "cancelled":
        reminder.status = ReminderStatus.cancelled
        return

    # Obtener usuario destinatario
    user_result = await db.execute(
        select(User).where(User.id == reminder.user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        return

    # Determinar nombre de la otra parte
    p_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == appt.patient_id)
    )
    patient = p_result.scalar_one_or_none()

    ps_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == appt.psychologist_id)
    )
    psych = ps_result.scalar_one_or_none()

    if user.role == "patient":
        name = patient.full_name if patient else "Paciente"
        other_name = psych.full_name if psych else "tu psicólogo/a"
    else:
        name = psych.full_name if psych else "Psicólogo"
        other_name = patient.full_name if patient else "tu paciente"

    hours_before = 24 if "24h" in reminder.reminder_type else 1

    await send_appointment_reminder(
        to=user.email,
        name=name,
        scheduled_at=appt.scheduled_at,
        duration_min=appt.duration_min,
        other_party_name=other_name,
        role=user.role,
        hours_before=hours_before,
    )


async def run_scheduler() -> None:
    """Loop infinito que ejecuta el scheduler cada 60 segundos."""
    logger.info("Scheduler de recordatorios iniciado")
    while True:
        await asyncio.sleep(60)
        await process_pending_reminders()