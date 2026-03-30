"""
Sistema de reseñas y reputación de psicólogos.
Un paciente puede reseñar una cita completada, solo una vez por cita.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field
from typing import Optional
import uuid

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import (
    User, Review, Appointment, PatientProfile,
    PsychologistProfile, AppointmentStatus
)

router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewCreate(BaseModel):
    appointment_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)
    is_anonymous: bool = False


class ReviewOut(BaseModel):
    id: str
    rating: int
    comment: Optional[str]
    is_anonymous: bool
    patient_name: Optional[str]
    created_at: str


@router.post("/", status_code=201)
async def create_review(
    data: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Solo pacientes pueden dejar reseña. Una por cita completada."""
    if current_user.role != "patient":
        raise HTTPException(status_code=403, detail="Solo los pacientes pueden dejar reseñas")

    # Obtener perfil de paciente
    p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    patient = p.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Perfil de paciente no encontrado")

    # Verificar que la cita existe y está completada
    a = await db.execute(select(Appointment).where(Appointment.id == data.appointment_id))
    appointment = a.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if appointment.status != AppointmentStatus.completed:
        raise HTTPException(status_code=400, detail="Solo puedes reseñar citas completadas")
    if appointment.patient_id != patient.id:
        raise HTTPException(status_code=403, detail="Esta cita no es tuya")

    # Verificar que no existe reseña ya
    existing = await db.execute(select(Review).where(Review.appointment_id == data.appointment_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya has dejado una reseña para esta cita")

    review = Review(
        patient_id=patient.id,
        psychologist_id=appointment.psychologist_id,
        appointment_id=appointment.id,
        rating=data.rating,
        comment=data.comment,
        is_anonymous=data.is_anonymous,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return {"id": str(review.id), "rating": review.rating, "message": "Reseña publicada. ¡Gracias!"}


@router.get("/psychologist/{psychologist_id}")
async def get_psychologist_reviews(
    psychologist_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Reseñas públicas de un psicólogo con estadísticas."""
    result = await db.execute(
        select(Review)
        .where(Review.psychologist_id == psychologist_id, Review.is_visible == True)
        .order_by(Review.created_at.desc())
        .limit(50)
    )
    reviews = result.scalars().all()

    # Stats
    ratings = [r.rating for r in reviews]
    avg = sum(ratings) / len(ratings) if ratings else 0
    dist = {i: ratings.count(i) for i in range(1, 6)}

    # Nombres de pacientes (si no son anónimos)
    out = []
    for r in reviews:
        patient_name = None
        if not r.is_anonymous:
            p = await db.execute(select(PatientProfile).where(PatientProfile.id == r.patient_id))
            patient = p.scalar_one_or_none()
            if patient:
                parts = patient.full_name.split()
                patient_name = parts[0] + (" " + parts[1][0] + "." if len(parts) > 1 else "")
        out.append({
            "id":           str(r.id),
            "rating":       r.rating,
            "comment":      r.comment,
            "patient_name": patient_name or "Paciente anónimo",
            "created_at":   r.created_at.isoformat(),
        })

    return {
        "avg_rating":   round(avg, 2),
        "total":        len(reviews),
        "distribution": dist,
        "reviews":      out,
    }


@router.get("/my-pending")
async def get_pending_reviews(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Citas completadas que el paciente todavía no ha reseñado."""
    if current_user.role != "patient":
        return []

    p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    patient = p.scalar_one_or_none()
    if not patient:
        return []

    # Citas completadas sin reseña
    completed = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == patient.id,
            Appointment.status == AppointmentStatus.completed,
        )
    )
    appointments = completed.scalars().all()

    pending = []
    for a in appointments:
        rev = await db.execute(select(Review).where(Review.appointment_id == a.id))
        if not rev.scalar_one_or_none():
            ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.id == a.psychologist_id))
            psych = ps.scalar_one_or_none()
            pending.append({
                "appointment_id": str(a.id),
                "scheduled_at":   a.scheduled_at.isoformat(),
                "psychologist_name": psych.full_name if psych else "Psicólogo",
            })

    return pending
