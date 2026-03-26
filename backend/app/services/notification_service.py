"""
Servicio de notificaciones en app.
Crea notificaciones para: cita confirmada, match aceptado,
sesión completada, ejercicios asignados.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import uuid as uuid_mod

from app.models.user import Notification, User

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: str,
    notification_type: str,
    title: str,
    body: str | None = None,
    action_url: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=notification_type,
        notification_type=notification_type,
        title=title,
        body=body,
        action_url=action_url,
        is_read=False,
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    logger.info(f"Notificación creada para user {str(user_id)[:8]}...: {title}")
    return notif


async def mark_all_read(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return result.rowcount


async def get_unread_count(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func, select
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
    )
    return result.scalar() or 0
