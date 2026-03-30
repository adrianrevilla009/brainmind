"""
Suscripciones SaaS para psicólogos.
Planes: Free (3 pacientes) | Pro 29€/mes | Clinic 99€/mes
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user, require_psychologist
from app.core.config import get_settings
from app.models.user import User, Subscription, PsychologistProfile, SubscriptionPlan

router = APIRouter(prefix="/subscription", tags=["subscription"])
settings = get_settings()

PLANS = {
    "free": {
        "name": "Free",
        "price_eur": 0,
        "max_patients": 3,
        "features": ["Hasta 3 pacientes activos", "Agenda y videollamada", "Perfil público básico"],
        "locked": ["IA clínica (SOAP)", "Analytics avanzados", "Export de datos", "Soporte prioritario"],
    },
    "pro": {
        "name": "Pro",
        "price_eur": 2900,  # céntimos
        "stripe_price_id": settings.stripe_pro_price_id if hasattr(settings, 'stripe_pro_price_id') else "",
        "max_patients": -1,  # ilimitado
        "features": [
            "Pacientes ilimitados",
            "IA clínica: SOAP automático",
            "Analytics de evolución de pacientes",
            "Recordatorios automáticos",
            "Export de informes",
            "Soporte prioritario",
        ],
        "locked": [],
    },
    "clinic": {
        "name": "Clínica",
        "price_eur": 9900,
        "stripe_price_id": settings.stripe_clinic_price_id if hasattr(settings, 'stripe_clinic_price_id') else "",
        "max_patients": -1,
        "features": [
            "Todo lo de Pro",
            "Hasta 10 psicólogos",
            "Panel de administración",
            "Facturación centralizada",
            "API de integración",
            "Account manager dedicado",
        ],
        "locked": [],
    },
}


async def _get_or_create_subscription(psychologist_id, db: AsyncSession) -> Subscription:
    result = await db.execute(
        select(Subscription).where(Subscription.psychologist_id == psychologist_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        sub = Subscription(psychologist_id=psychologist_id, plan=SubscriptionPlan.free)
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return sub


@router.get("/plans")
async def get_plans():
    """Devuelve la definición de todos los planes (público)."""
    return PLANS


@router.get("/status")
async def get_subscription_status(
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Estado actual de la suscripción del psicólogo."""
    ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    psych = ps.scalar_one_or_none()
    if not psych:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    sub = await _get_or_create_subscription(psych.id, db)
    plan_info = PLANS.get(sub.plan.value, PLANS["free"])

    return {
        "plan":                  sub.plan.value,
        "status":                sub.status.value,
        "plan_name":             plan_info["name"],
        "max_patients":          plan_info["max_patients"],
        "features":              plan_info["features"],
        "locked_features":       plan_info["locked"],
        "current_period_end":    sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end":  sub.cancel_at_period_end,
        "is_pro":                sub.plan != SubscriptionPlan.free,
    }


@router.post("/create-checkout")
async def create_checkout_session(
    plan: str,
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Crea sesión de Stripe Checkout para suscripción."""
    if plan not in ("pro", "clinic"):
        raise HTTPException(status_code=400, detail="Plan inválido")

    try:
        import stripe
        stripe.api_key = settings.stripe_secret_key

        ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
        psych = ps.scalar_one_or_none()
        sub = await _get_or_create_subscription(psych.id, db)

        price_id = PLANS[plan].get("stripe_price_id", "")
        if not price_id:
            raise HTTPException(status_code=503, detail="Stripe no configurado. Contacta con soporte.")

        checkout = stripe.checkout.Session.create(
            customer=sub.stripe_customer_id or None,
            customer_email=current_user.email if not sub.stripe_customer_id else None,
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{settings.frontend_url}/dashboard/subscription?success=1",
            cancel_url=f"{settings.frontend_url}/dashboard/subscription?cancelled=1",
            metadata={"psychologist_id": str(psych.id), "plan": plan},
        )
        return {"checkout_url": checkout.url}

    except ImportError:
        raise HTTPException(status_code=503, detail="Stripe no disponible")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_subscription_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Webhook de Stripe para actualizar estado de suscripción."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        import stripe
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook inválido")

    data = event["data"]["object"]

    if event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
        psychologist_id = data.get("metadata", {}).get("psychologist_id")
        if psychologist_id:
            result = await db.execute(
                select(Subscription).where(Subscription.psychologist_id == psychologist_id)
            )
            sub = result.scalar_one_or_none()
            if sub:
                plan_name = data.get("metadata", {}).get("plan", "free")
                sub.plan = SubscriptionPlan(plan_name)
                sub.status = data["status"]
                sub.stripe_subscription_id = data["id"]
                sub.stripe_customer_id = data["customer"]
                sub.current_period_start = datetime.fromtimestamp(data["current_period_start"], tz=timezone.utc)
                sub.current_period_end = datetime.fromtimestamp(data["current_period_end"], tz=timezone.utc)
                sub.cancel_at_period_end = data.get("cancel_at_period_end", False)
                await db.commit()

    elif event["type"] == "customer.subscription.deleted":
        stripe_sub_id = data["id"]
        result = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.plan = SubscriptionPlan.free
            sub.status = "cancelled"
            await db.commit()

    return {"received": True}


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(require_psychologist),
    db: AsyncSession = Depends(get_db),
):
    """Cancela la suscripción al final del período."""
    ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    psych = ps.scalar_one_or_none()
    sub = await _get_or_create_subscription(psych.id, db)

    if not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No tienes suscripción activa de pago")

    try:
        import stripe
        stripe.api_key = settings.stripe_secret_key
        stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
        sub.cancel_at_period_end = True
        await db.commit()
        return {"message": "Suscripción cancelada. Seguirás con acceso Pro hasta el fin del período."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
