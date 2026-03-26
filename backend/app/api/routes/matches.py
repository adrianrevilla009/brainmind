from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_patient, require_psychologist
from app.models.user import User, Match, PsychologistProfile, PatientProfile
from app.schemas.schemas import MatchOut, MatchStatusUpdate

router = APIRouter(prefix="/matches", tags=["matches"])


def compute_compatibility(patient: PatientProfile, psychologist: PsychologistProfile) -> tuple[float, list[str]]:
    """Algoritmo de compatibilidad básico para MVP. Score 0-1."""
    score = 0.0
    reasons = []

    # Enfoque terapéutico preferido
    if patient.preferred_approach and psychologist.approaches:
        if patient.preferred_approach in psychologist.approaches:
            score += 0.35
            reasons.append(f"Especializado en {patient.preferred_approach}")

    # Problemas presentados vs especializaciones
    if patient.presenting_issues and psychologist.specializations:
        matches = set(patient.presenting_issues) & set(psychologist.specializations)
        if matches:
            score += 0.30
            reasons.append(f"Experiencia en: {', '.join(list(matches)[:2])}")

    # Precio accesible (si el paciente tiene preferencia, comparamos)
    if psychologist.session_price_eur <= 7000:  # <= €70
        score += 0.15
        reasons.append("Precio accesible")

    # Disponibilidad online
    if psychologist.online_only is False:
        score += 0.10
        reasons.append("Sesiones presenciales y online")

    # Idioma
    if "es" in (psychologist.languages or ["es"]):
        score += 0.10
        reasons.append("Español nativo")

    return min(score, 1.0), reasons


@router.post("/generate", response_model=list[MatchOut])
async def generate_matches(
    current_user: User = Depends(require_patient),
    db: AsyncSession = Depends(get_db),
):
    """Genera matches automáticos para un paciente basados en su perfil."""
    # Obtener perfil paciente
    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Completa tu perfil primero")

    # Obtener psicólogos activos
    psych_result = await db.execute(select(PsychologistProfile))
    psychologists = psych_result.scalars().all()

    # Obtener matches existentes para no duplicar
    existing_result = await db.execute(
        select(Match.psychologist_id).where(Match.patient_id == patient.id)
    )
    existing_psych_ids = {str(row) for row in existing_result.scalars().all()}

    new_matches = []
    for psych in psychologists:
        if str(psych.id) in existing_psych_ids:
            continue

        score, reasons = compute_compatibility(patient, psych)

        if score >= 0.3:  # Umbral mínimo de compatibilidad
            match = Match(
                patient_id=patient.id,
                psychologist_id=psych.id,
                compatibility_score=score,
                match_reasons=reasons,
                initiated_by=current_user.role,
            )
            db.add(match)
            new_matches.append(match)

    await db.commit()

    # Ordenar por score descendente
    new_matches.sort(key=lambda m: m.compatibility_score or 0, reverse=True)
    return new_matches[:10]  # máx 10 matches


@router.get("/my", response_model=list[MatchOut])
async def get_my_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "patient":
        patient_result = await db.execute(
            select(PatientProfile).where(PatientProfile.user_id == current_user.id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient:
            return []

        result = await db.execute(
            select(Match).where(Match.patient_id == patient.id)
            .order_by(Match.compatibility_score.desc())
        )
    else:
        psych_result = await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
        )
        psych = psych_result.scalar_one_or_none()
        if not psych:
            return []

        result = await db.execute(
            select(Match).where(Match.psychologist_id == psych.id)
        )

    matches = result.scalars().all()

    # Enriquecer con datos del psicólogo para el paciente
    enriched = []
    for match in matches:
        match_dict = {
            "id": match.id,
            "patient_id": match.patient_id,
            "psychologist_id": match.psychologist_id,
            "status": match.status,
            "compatibility_score": match.compatibility_score,
            "match_reasons": match.match_reasons or [],
            "initiated_by": match.initiated_by,
            "created_at": match.created_at,
        }

        if current_user.role == "patient":
            psych_result = await db.execute(
                select(PsychologistProfile).where(PsychologistProfile.id == match.psychologist_id)
            )
            psych_profile = psych_result.scalar_one_or_none()
            match_dict["psychologist"] = psych_profile

        enriched.append(match_dict)

    return enriched


@router.patch("/{match_id}/status", response_model=MatchOut)
async def update_match_status(
    match_id: str,
    data: MatchStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match no encontrado")

    match.status = data.status
    await db.commit()
    await db.refresh(match)
    return match
