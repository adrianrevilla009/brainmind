from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import stripe
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist
from app.core.config import get_settings
from app.models.user import User, Payment, Appointment, PsychologistProfile, PatientProfile
from app.schemas.schemas import PaymentIntentCreate, PaymentIntentOut

settings = get_settings()
stripe.api_key = settings.stripe_secret_key

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/create-intent", response_model=PaymentIntentOut)
async def create_payment_intent(
    data: PaymentIntentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Obtener cita
    appt_result = await db.execute(select(Appointment).where(Appointment.id == data.appointment_id))
    appointment = appt_result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # Obtener psicólogo y su precio
    psych_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.id == appointment.psychologist_id)
    )
    psychologist = psych_result.scalar_one_or_none()
    if not psychologist:
        raise HTTPException(status_code=404, detail="Psicólogo no encontrado")

    if not psychologist.stripe_onboarded or not psychologist.stripe_account_id:
        raise HTTPException(status_code=400, detail="El psicólogo aún no ha configurado pagos")

    amount = psychologist.session_price_eur
    platform_fee = int(amount * settings.platform_fee_percent)
    psychologist_amount = amount - platform_fee

    if not settings.stripe_secret_key or settings.stripe_secret_key.startswith("sk_test_..."):
        # Modo demo sin Stripe real
        payment = Payment(
            appointment_id=appointment.id,
            patient_id=appointment.patient_id,
            psychologist_id=appointment.psychologist_id,
            amount_eur=amount,
            platform_fee_eur=platform_fee,
            psychologist_amount_eur=psychologist_amount,
            stripe_payment_intent_id=f"pi_demo_{appointment.id}",
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        return PaymentIntentOut(
            client_secret="demo_client_secret",
            payment_id=payment.id,
            amount_eur=amount,
            platform_fee_eur=platform_fee,
        )

    # Stripe real
    intent = stripe.PaymentIntent.create(
        amount=amount,
        currency="eur",
        application_fee_amount=platform_fee,
        transfer_data={"destination": psychologist.stripe_account_id},
        metadata={"appointment_id": str(appointment.id)},
    )

    payment = Payment(
        appointment_id=appointment.id,
        patient_id=appointment.patient_id,
        psychologist_id=appointment.psychologist_id,
        amount_eur=amount,
        platform_fee_eur=platform_fee,
        psychologist_amount_eur=psychologist_amount,
        stripe_payment_intent_id=intent.id,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return PaymentIntentOut(
        client_secret=intent.client_secret,
        payment_id=payment.id,
        amount_eur=amount,
        platform_fee_eur=platform_fee,
    )


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook inválido")

    if event["type"] == "payment_intent.succeeded":
        intent_id = event["data"]["object"]["id"]
        result = await db.execute(
            select(Payment).where(Payment.stripe_payment_intent_id == intent_id)
        )
        payment = result.scalar_one_or_none()
        if payment:
            payment.status = "paid"
            payment.paid_at = datetime.now(timezone.utc)
            await db.commit()

    return {"status": "ok"}


@router.post("/stripe-onboard")
async def onboard_psychologist(
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Genera el link de onboarding de Stripe Connect para el psicólogo."""
    psych_result = await db.execute(
        select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id)
    )
    psychologist = psych_result.scalar_one_or_none()

    if not settings.stripe_secret_key or settings.stripe_secret_key.startswith("sk_test_..."):
        return {"url": "/dashboard?stripe=demo", "message": "Modo demo — configura Stripe en .env"}

    if not psychologist.stripe_account_id:
        account = stripe.Account.create(type="express", country="ES")
        psychologist.stripe_account_id = account.id
        await db.commit()

    link = stripe.AccountLink.create(
        account=psychologist.stripe_account_id,
        refresh_url=f"{settings.frontend_url}/dashboard/payments?refresh=true",
        return_url=f"{settings.frontend_url}/dashboard/payments?success=true",
        type="account_onboarding",
    )
    return {"url": link.url}
