from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_patient, require_psychologist
from app.models.user import User, Match, PsychologistProfile, PatientProfile
from app.schemas.schemas import MatchOut, MatchStatusUpdate

router = APIRouter(prefix="/matches", tags=["matches"])


async def _enrich_match(match: Match, db: AsyncSession, include_psychologist: bool = True) -> dict:
    """Serializa un Match añadiendo el perfil del psicólogo."""
    match_dict = {
        "id": match.id,
        "patient_id": match.patient_id,
        "psychologist_id": match.psychologist_id,
        "status": match.status,
        "compatibility_score": match.compatibility_score,
        "match_reasons": match.match_reasons or [],
        "initiated_by": match.initiated_by,
        "created_at": match.created_at,
        "psychologist": None,
    }
    if include_psychologist:
        psych_result = await db.execute(
            select(PsychologistProfile).where(PsychologistProfile.id == match.psychologist_id)
        )
        psych_profile = psych_result.scalar_one_or_none()
        if psych_profile:
            match_dict["psychologist"] = {
                "id": str(psych_profile.id),
                "full_name": psych_profile.full_name,
                "bio": psych_profile.bio,
                "specializations": psych_profile.specializations or [],
                "approaches": psych_profile.approaches or [],
                "languages": psych_profile.languages or [],
                "session_price_eur": psych_profile.session_price_eur,
                "session_duration_min": psych_profile.session_duration_min,
                "city": psych_profile.city,
                "country": psych_profile.country,
                "avatar_url": psych_profile.avatar_url,
                "stripe_onboarded": psych_profile.stripe_onboarded,
                "ai_summary": psych_profile.ai_summary,
                "license_verified": psych_profile.license_verified,
                "accepts_insurance": psych_profile.accepts_insurance,
                "online_only": psych_profile.online_only,
            }
    return match_dict


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

    # Ordenar por score descendente y enriquecer con datos del psicólogo
    new_matches.sort(key=lambda m: m.compatibility_score or 0, reverse=True)
    return [await _enrich_match(m, db) for m in new_matches[:10]]


@router.get("/my")
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

        # JOIN en una sola query para evitar problemas de caché de sesión SQLAlchemy
        result = await db.execute(
            select(Match, PsychologistProfile)
            .join(PsychologistProfile, PsychologistProfile.id == Match.psychologist_id)
            .where(Match.patient_id == patient.id)
            .order_by(Match.compatibility_score.desc())
        )
        rows = result.all()

        enriched = []
        for match, psych in rows:
            enriched.append({
                "id": str(match.id),
                "patient_id": str(match.patient_id),
                "psychologist_id": str(match.psychologist_id),
                "status": match.status,
                "compatibility_score": match.compatibility_score,
                "match_reasons": match.match_reasons or [],
                "initiated_by": match.initiated_by,
                "created_at": match.created_at,
                "psychologist": {
                    "id": str(psych.id),
                    "full_name": psych.full_name,
                    "bio": psych.bio,
                    "specializations": psych.specializations or [],
                    "approaches": psych.approaches or [],
                    "languages": psych.languages or [],
                    "session_price_eur": psych.session_price_eur,
                    "session_duration_min": psych.session_duration_min,
                    "city": psych.city,
                    "country": psych.country,
                    "avatar_url": psych.avatar_url,
                    "stripe_onboarded": psych.stripe_onboarded,
                    "license_verified": psych.license_verified,
                    "accepts_insurance": psych.accepts_insurance,
                    "online_only": psych.online_only,
                } if psych else None,
            })
        return enriched

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
        return [await _enrich_match(m, db, include_psychologist=False) for m in matches]


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
    return await _enrich_match(match, db)