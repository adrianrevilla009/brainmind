"""
Web Push Notifications.
Permite enviar notificaciones push al navegador sin app nativa.
Requiere: pywebpush, VAPID keys configuradas.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import get_settings
from app.models.user import User, PushSubscription

router = APIRouter(prefix="/push", tags=["push"])
settings = get_settings()


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None


@router.post("/subscribe", status_code=201)
async def subscribe(
    data: PushSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra suscripción push del navegador."""
    # Upsert — si ya existe el endpoint, actualizamos
    existing = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    sub = existing.scalar_one_or_none()

    if sub:
        sub.user_id = current_user.id
        sub.p256dh = data.p256dh
        sub.auth = data.auth
    else:
        sub = PushSubscription(
            user_id=current_user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
            user_agent=data.user_agent,
        )
        db.add(sub)

    await db.commit()
    return {"subscribed": True}


@router.delete("/unsubscribe")
async def unsubscribe(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Elimina suscripción push."""
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == endpoint,
            PushSubscription.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"unsubscribed": True}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Devuelve la clave pública VAPID para el frontend."""
    key = getattr(settings, "vapid_public_key", "")
    if not key:
        return {"key": None, "enabled": False}
    return {"key": key, "enabled": True}


# ── Función helper para enviar push (usada por reminder_service) ──────────────

async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/dashboard") -> int:
    """
    Envía push a todos los dispositivos suscritos de un usuario.
    Devuelve número de notificaciones enviadas.
    Requiere: pip install pywebpush
    """
    vapid_private = getattr(settings, "vapid_private_key", "")
    vapid_email = getattr(settings, "vapid_email", "mailto:admin@brainmind.app")

    if not vapid_private:
        return 0  # VAPID no configurado, silenciar

    try:
        from pywebpush import webpush, WebPushException
        import json
        from app.core.database import async_session_factory

        async with async_session_factory() as db:
            result = await db.execute(
                select(PushSubscription).where(PushSubscription.user_id == user_id)
            )
            subscriptions = result.scalars().all()

        sent = 0
        for sub in subscriptions:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=json.dumps({"title": title, "body": body, "url": url}),
                    vapid_private_key=vapid_private,
                    vapid_claims={"sub": vapid_email},
                )
                sent += 1
            except WebPushException as e:
                if e.response and e.response.status_code in (404, 410):
                    # Suscripción caducada — borrar
                    async with async_session_factory() as db:
                        await db.execute(
                            delete(PushSubscription).where(PushSubscription.endpoint == sub.endpoint)
                        )
                        await db.commit()
        return sent

    except ImportError:
        return 0  # pywebpush no instalado
    except Exception:
        return 0
