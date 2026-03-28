"""
Router RGPD — /api/rgpd/...

GET  /rgpd/my-data          Solicitar export de datos
GET  /rgpd/requests         Ver mis solicitudes RGPD
POST /rgpd/delete-account   Solicitar borrado de cuenta
"""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.rgpd_service import generate_user_export, delete_user_account
from app.services.email_service import send_rgpd_export_ready, send_account_deletion_confirmation
from app.services.notification_service import create_notification

router = APIRouter(prefix="/rgpd", tags=["rgpd"])


async def _process_export(user_id: str, user_email: str, user_name: str, request_id: str):
    """Background: genera el export y notifica al usuario."""
    from app.core.database import async_session_factory
    from app.models.user import RgpdRequest

    async with async_session_factory() as db:
        try:
            export_data = await generate_user_export(db, user_id)
            export_json = json.dumps(export_data, ensure_ascii=False, indent=2)

            # En prod: subir a S3/R2 con URL firmada.
            # En dev: guardamos en disco y devolvemos URL de descarga.
            filename = f"brainmind_export_{user_id[:8]}_{datetime.now().strftime('%Y%m%d')}.json"
            filepath = f"/app/uploads/exports/{filename}"
            import os
            os.makedirs("/app/uploads/exports", exist_ok=True)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(export_json)

            export_url = f"http://localhost:8000/api/rgpd/download/{filename}"

            # Actualizar solicitud
            req_result = await db.execute(
                select(RgpdRequest).where(RgpdRequest.id == request_id)
            )
            req = req_result.scalar_one_or_none()
            if req:
                req.status = "completed"
                req.export_url = export_url
                req.processed_at = datetime.now(timezone.utc)
                await db.commit()

            # Notificar
            await send_rgpd_export_ready(
                to=user_email, name=user_name, export_url=export_url
            )
            await create_notification(
                db=db, user_id=user_id,
                notification_type="rgpd_export_ready",
                title="Tu export de datos está listo",
                body="Hemos enviado el enlace de descarga a tu email.",
                action_url="/dashboard/rgpd",
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error procesando export RGPD: {e}")
            req_result = await db.execute(select(RgpdRequest).where(RgpdRequest.id == request_id))
            req = req_result.scalar_one_or_none()
            if req:
                req.status = "rejected"
                await db.commit()


async def _process_deletion(user_id: str, user_email: str, user_name: str):
    """Background: elimina cuenta y envía confirmación."""
    from app.core.database import async_session_factory
    async with async_session_factory() as db:
        try:
            await delete_user_account(db, user_id)
            await send_account_deletion_confirmation(to=user_email, name=user_name)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Error eliminando cuenta {user_id}: {e}")


@router.post("/my-data")
async def request_data_export(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Solicita un export completo de todos los datos del usuario (Art. 20 RGPD)."""
    from app.models.user import RgpdRequest, PsychologistProfile, PatientProfile

    # Verificar no hay solicitud pendiente reciente
    from sqlalchemy import and_
    from datetime import timedelta
    recent = await db.execute(
        select(RgpdRequest).where(
            RgpdRequest.user_id == current_user.id,
            RgpdRequest.status.in_(["pending", "processing"]),
        )
    )
    if recent.scalar_one_or_none():
        raise HTTPException(400, "Ya tienes una solicitud de export en proceso")

    # Obtener nombre
    if current_user.role == "psychologist":
        p = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    else:
        p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    profile = p.scalar_one_or_none()
    name = profile.full_name if profile else current_user.email

    request = RgpdRequest(
        user_id=current_user.id,
        request_type="export",
        status="processing",
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)

    background_tasks.add_task(
        _process_export, str(current_user.id), current_user.email, name, str(request.id)
    )

    return {
        "request_id": str(request.id),
        "status": "processing",
        "message": "Recibirás un email con el enlace de descarga en breve.",
    }


@router.get("/requests")
async def get_rgpd_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista las solicitudes RGPD del usuario."""
    from app.models.user import RgpdRequest
    result = await db.execute(
        select(RgpdRequest)
        .where(RgpdRequest.user_id == current_user.id)
        .order_by(RgpdRequest.created_at.desc())
        .limit(10)
    )
    requests = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "type": r.request_type,
            "status": r.status,
            "export_url": r.export_url,
            "created_at": r.created_at.isoformat(),
            "processed_at": r.processed_at.isoformat() if r.processed_at else None,
        }
        for r in requests
    ]


@router.delete("/delete-account")
async def delete_account(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina permanentemente la cuenta y todos los datos (Art. 17 RGPD).
    Esta acción es irreversible.
    """
    from app.models.user import PsychologistProfile, PatientProfile

    if current_user.role == "psychologist":
        p = await db.execute(select(PsychologistProfile).where(PsychologistProfile.user_id == current_user.id))
    else:
        p = await db.execute(select(PatientProfile).where(PatientProfile.user_id == current_user.id))
    profile = p.scalar_one_or_none()
    name = profile.full_name if profile else current_user.email

    # El borrado es async para no dejar al usuario esperando
    background_tasks.add_task(
        _process_deletion, str(current_user.id), current_user.email, name
    )

    return {
        "message": "Tu cuenta será eliminada en breve. Recibirás un email de confirmación.",
        "warning": "Esta acción es irreversible.",
    }


@router.get("/download/{filename}")
async def download_export(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Descarga el export de datos (solo en dev — en prod usar URL firmada de S3)."""
    import os
    from fastapi.responses import FileResponse

    # Verificar que el filename pertenece al usuario actual
    if str(current_user.id)[:8] not in filename:
        raise HTTPException(403, "Sin acceso a este archivo")

    filepath = f"/app/uploads/exports/{filename}"
    if not os.path.exists(filepath):
        raise HTTPException(404, "Archivo no encontrado o expirado")

    return FileResponse(
        filepath,
        media_type="application/json",
        filename=filename,
    )
