"""
Router de analytics — /api/analytics/...

GET /analytics/patients/{patient_id}   Evolución del paciente (psicólogo)
GET /analytics/my-progress             Mi progreso (paciente)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist
from app.models.user import User, PsychologistProfile, PatientProfile
from app.services.analytics_service import get_patient_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/patients/{patient_id}")
async def patient_analytics(
    patient_id: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Evolución analítica de un paciente (solo su psicólogo)."""
    data = await get_patient_analytics(db, patient_id)
    return {"patient_id": patient_id, "sessions": data, "total": len(data)}


@router.get("/my-progress")
async def my_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """El paciente puede ver su propia evolución."""
    if current_user.role != "patient":
        raise HTTPException(403, "Solo disponible para pacientes")

    p_result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    patient = p_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(404, "Perfil no encontrado")

    data = await get_patient_analytics(db, str(patient.id))
    return {"sessions": data, "total": len(data)}
