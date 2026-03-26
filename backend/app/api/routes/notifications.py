"""
Router de notificaciones — /api/notifications/...

GET  /notifications/          Lista las últimas 30 notificaciones del usuario
GET  /notifications/unread-count  Número de no leídas (para badge en sidebar)
PATCH /notifications/read-all  Marca todas como leídas
PATCH /notifications/{id}/read Marca una como leída
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
    )
    notifs = result.scalars().all()
    return [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "body": n.body,
            "action_url": getattr(n, "action_url", None),
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat(),
        }
        for n in notifs
    ]


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.notification_service import get_unread_count
    count = await get_unread_count(db, str(current_user.id))
    return {"count": count}


@router.patch("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.notification_service import mark_all_read
    count = await mark_all_read(db, str(current_user.id))
    return {"marked_read": count}


@router.patch("/{notification_id}/read")
async def mark_one_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
