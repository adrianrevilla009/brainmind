"""
Chat en tiempo real (polling) entre paciente y psicólogo.
Basado en el match_id — solo los usuarios del match pueden leer/escribir.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import (
    User, ChatMessage, Match,
    PatientProfile, PsychologistProfile
)

router = APIRouter(prefix="/chat", tags=["chat"])


async def _verify_match_access(match_id: str, user: User, db: AsyncSession) -> Match:
    """Verifica que el usuario pertenece al match."""
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")

    # Verificar acceso
    if user.role == "patient":
        p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == user.id))
        profile = p.scalar_one_or_none()
        if not profile or profile.id != match.patient_id:
            raise HTTPException(status_code=403, detail="Sin acceso")
    else:
        p = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == user.id))
        profile = p.scalar_one_or_none()
        if not profile or profile.id != match.psychologist_id:
            raise HTTPException(status_code=403, detail="Sin acceso")
    return match


class MessageCreate(BaseModel):
    content: str


@router.get("/conversations")
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista todas las conversaciones activas del usuario con el último mensaje."""
    if current_user.role == "patient":
        p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
        profile = p.scalar_one_or_none()
        if not profile:
            return []
        matches_q = await db.execute(
            select(Match).where(Match.patient_id == profile.id, Match.status == "accepted")
        )
    else:
        p = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
        profile = p.scalar_one_or_none()
        if not profile:
            return []
        matches_q = await db.execute(
            select(Match).where(Match.psychologist_id == profile.id, Match.status == "accepted")
        )

    matches = matches_q.scalars().all()
    conversations = []

    for match in matches:
        # Último mensaje
        last_q = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.match_id == match.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last_q.scalar_one_or_none()

        # No leídos
        unread_q = await db.execute(
            select(ChatMessage).where(
                ChatMessage.match_id == match.id,
                ChatMessage.sender_id != current_user.id,
                ChatMessage.read_at == None,
            )
        )
        unread = len(unread_q.scalars().all())

        # Nombre del interlocutor
        if current_user.role == "patient":
            ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.id == match.psychologist_id))
            other = ps.scalar_one_or_none()
            other_name = other.full_name if other else "Psicólogo"
        else:
            pa = await db.execute(select(PatientProfile).where(PatientProfile.id == match.patient_id))
            other = pa.scalar_one_or_none()
            other_name = other.full_name if other else "Paciente"

        conversations.append({
            "match_id":       str(match.id),
            "other_name":     other_name,
            "last_message":   last_msg.content[:60] if last_msg else None,
            "last_message_at": last_msg.created_at.isoformat() if last_msg else None,
            "unread_count":   unread,
        })

    # Ordenar por último mensaje
    conversations.sort(key=lambda x: x["last_message_at"] or "", reverse=True)
    return conversations


@router.get("/{match_id}/messages")
async def get_messages(
    match_id: str,
    limit: int = 50,
    before: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Historial de mensajes paginado. Marca como leídos los mensajes del otro."""
    await _verify_match_access(match_id, current_user, db)

    query = (
        select(ChatMessage)
        .where(ChatMessage.match_id == match_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    if before:
        query = query.where(ChatMessage.created_at < before)

    result = await db.execute(query)
    messages = result.scalars().all()

    # Marcar como leídos los mensajes del otro que aún no se han leído
    await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.match_id == match_id,
            ChatMessage.sender_id != current_user.id,
            ChatMessage.read_at == None,
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.commit()

    return [
        {
            "id":         str(m.id),
            "sender_id":  str(m.sender_id),
            "content":    m.content,
            "msg_type":   m.msg_type,
            "read_at":    m.read_at.isoformat() if m.read_at else None,
            "created_at": m.created_at.isoformat(),
            "is_mine":    m.sender_id == current_user.id,
        }
        for m in reversed(messages)
    ]


@router.post("/{match_id}/messages", status_code=201)
async def send_message(
    match_id: str,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Envía un mensaje al match. Crea notificación in-app para el destinatario."""
    match = await _verify_match_access(match_id, current_user, db)

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    if len(body.content) > 4000:
        raise HTTPException(status_code=400, detail="Mensaje demasiado largo (máx 4000 chars)")

    msg = ChatMessage(
        match_id=match_id,
        sender_id=current_user.id,
        content=body.content.strip(),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Notificación in-app al destinatario
    try:
        if current_user.role == "patient":
            ps = await db.execute(select(PsychologistProfile).where(PsychologistProfile.id == match.psychologist_id))
            psych = ps.scalar_one_or_none()
            recipient_user_id = psych.user_id if psych else None
            sender_name = "Tu paciente"
        else:
            pa = await db.execute(select(PatientProfile).where(PatientProfile.id == match.patient_id))
            patient = pa.scalar_one_or_none()
            recipient_user_id = patient.user_id if patient else None
            sender_name = "Tu psicólogo/a"

        if recipient_user_id:
            from app.services.notification_service import create_notification
            await create_notification(
                db, str(recipient_user_id), "new_message",
                f"Nuevo mensaje de {sender_name}",
                body.content[:80] + ("..." if len(body.content) > 80 else ""),
                f"/dashboard/chat/{match_id}",
            )
    except Exception:
        pass

    return {
        "id":         str(msg.id),
        "sender_id":  str(msg.sender_id),
        "content":    msg.content,
        "msg_type":   msg.msg_type,
        "read_at":    None,
        "created_at": msg.created_at.isoformat(),
        "is_mine":    True,
    }
