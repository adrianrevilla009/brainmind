from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
import secrets

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.core.config import get_settings
from app.models.user import User, PsychologistProfile, PatientProfile
from app.schemas.schemas import RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


async def _send_verification_bg(user_id: str, email: str, name: str):
    from app.core.database import async_session_factory
    from app.services.email_service import send_verification_email

    async with async_session_factory() as db:
        try:
            from app.models.user import EmailVerificationToken
            token_value = secrets.token_urlsafe(48)
            token = EmailVerificationToken(
                user_id=user_id,
                token=token_value,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
            )
            db.add(token)
            await db.commit()
            await send_verification_email(to=email, name=name, token=token_value)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error enviando verification email: {e}")


@router.post("/register", status_code=201)
async def register(
    data: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    # Sin Resend configurado → auto-verificar (dev)
    auto_verify = not settings.resend_api_key or settings.resend_api_key.startswith("re_...")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        is_verified=auto_verify,
    )
    db.add(user)
    await db.flush()

    if data.role == "psychologist":
        db.add(PsychologistProfile(user_id=user.id, full_name=data.full_name))
    else:
        db.add(PatientProfile(
            user_id=user.id,
            full_name=data.full_name,
            pseudo_token=secrets.token_hex(32),
        ))

    await db.commit()

    if not auto_verify:
        background_tasks.add_task(_send_verification_bg, str(user.id), user.email, data.full_name)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": str(user.id),
        "email_verified": user.is_verified,
        "verification_required": not user.is_verified,
    }


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    from app.models.user import EmailVerificationToken
    result = await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token == token,
            EmailVerificationToken.used_at == None,
        )
    )
    verification = result.scalar_one_or_none()
    if not verification:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")
    if verification.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="El enlace ha caducado. Solicita uno nuevo.")

    verification.used_at = datetime.now(timezone.utc)
    user_result = await db.execute(select(User).where(User.id == verification.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.is_verified = True
    await db.commit()
    return {"verified": True, "message": "Email verificado correctamente"}


@router.post("/resend-verification")
async def resend_verification(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_verified:
        raise HTTPException(status_code=400, detail="Tu cuenta ya está verificada")

    if current_user.role == "psychologist":
        p = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    else:
        p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    profile = p.scalar_one_or_none()
    name = profile.full_name if profile else current_user.email

    background_tasks.add_task(_send_verification_bg, str(current_user.id), current_user.email, name)
    return {"message": "Email de verificación reenviado"}


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Cuenta desactivada")

    resend_configured = settings.resend_api_key and not settings.resend_api_key.startswith("re_...")
    if not user.is_verified and resend_configured:
        raise HTTPException(status_code=403,
            detail="Verifica tu email antes de iniciar sesión. Revisa tu bandeja de entrada.")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, role=user.role, user_id=str(user.id))


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
    }
