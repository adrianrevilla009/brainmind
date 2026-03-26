from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist, require_patient
from app.models.user import User, PsychologistProfile, PatientProfile
from app.schemas.schemas import (
    PsychologistProfileCreate, PsychologistProfileOut,
    PatientProfileCreate, PatientProfileOut
)

router = APIRouter(prefix="/profiles", tags=["profiles"])


# --- Psicólogo ---
@router.get("/psychologist/me", response_model=PsychologistProfileOut)
async def get_my_psychologist_profile(
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return profile


@router.put("/psychologist/me", response_model=PsychologistProfileOut)
async def update_psychologist_profile(
    data: PsychologistProfileCreate,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/psychologist/{profile_id}", response_model=PsychologistProfileOut)
async def get_psychologist_profile(
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == profile_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Psicólogo no encontrado")
    return profile


@router.get("/psychologists", response_model=list[PsychologistProfileOut])
async def list_psychologists(
    specialization: str | None = None,
    approach: str | None = None,
    max_price: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(PsychologistProfile)
    result = await db.execute(query)
    profiles = result.scalars().all()

    # Filtros en Python (simple para MVP — en prod usar SQL)
    if specialization:
        profiles = [p for p in profiles if specialization in (p.specializations or [])]
    if approach:
        profiles = [p for p in profiles if approach in (p.approaches or [])]
    if max_price:
        profiles = [p for p in profiles if p.session_price_eur <= max_price * 100]

    return profiles


# --- Paciente ---
@router.get("/patient/me", response_model=PatientProfileOut)
async def get_my_patient_profile(
    current_user: User = Depends(require_patient),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return profile


@router.put("/patient/me", response_model=PatientProfileOut)
async def update_patient_profile(
    data: PatientProfileCreate,
    current_user: User = Depends(require_patient),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    if data.consent_data_processing or data.consent_ai_analysis or data.consent_transcription:
        from datetime import datetime, timezone
        profile.consent_date = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(profile)
    return profile
