"""
Servicio de email transaccional con Resend.

Emails implementados:
  - Verificación de cuenta al registrarse
  - Confirmación de cita (paciente)
  - Recordatorio 24h antes de cita (paciente + psicólogo)
  - Recordatorio 1h antes de cita
  - Resumen IA disponible (psicólogo)
  - Ejercicios asignados (paciente)
  - Export RGPD listo

Si RESEND_API_KEY está vacío, los emails se loguean en consola (modo dev).
"""
import logging
import httpx
from datetime import datetime
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

RESEND_URL = "https://api.resend.com/emails"


async def _send(to: str, subject: str, html: str) -> bool:
    """Envía un email. Devuelve True si OK, False si falla."""
    if not settings.resend_api_key or settings.resend_api_key.startswith("re_..."):
        # Modo dev: loguear en lugar de enviar
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
        logger.debug(f"[EMAIL MOCK] Body: {html[:200]}...")
        return True

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"BrainMind <{settings.from_email}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            resp.raise_for_status()
            logger.info(f"Email enviado a {to}: {subject}")
            return True
    except Exception as e:
        logger.error(f"Error enviando email a {to}: {e}")
        return False


def _base_template(content: str, title: str) -> str:
    """Template HTML base para todos los emails."""
    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#2d4a3e;padding:28px 40px;">
            <span style="font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">🧠 BrainMind</span>
          </td>
        </tr>
        <!-- Content -->
        <tr>
          <td style="padding:40px;">
            {content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #f0ede8;">
            <p style="margin:0;font-size:12px;color:#9b9b93;line-height:1.6;">
              BrainMind — Plataforma de apoyo psicológico<br>
              Este email es automático. Si tienes dudas, escríbenos a hola@brainmind.app<br>
              <a href="{settings.frontend_url}/dashboard/settings" style="color:#2d4a3e;">
                Gestionar preferencias de email
              </a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _btn(text: str, url: str, color: str = "#2d4a3e") -> str:
    return f"""
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:{color};border-radius:10px;padding:14px 28px;">
      <a href="{url}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">{text}</a>
    </td>
  </tr>
</table>
"""


# ─── Emails específicos ───────────────────────────────────────────────────────

async def send_verification_email(to: str, name: str, token: str) -> bool:
    verify_url = f"{settings.frontend_url}/verify-email?token={token}"
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Confirma tu cuenta, {name.split()[0]}</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Gracias por registrarte en BrainMind. Pulsa el botón para verificar tu dirección de email
  y activar tu cuenta.
</p>
{_btn("Verificar email", verify_url)}
<p style="margin:24px 0 0;font-size:13px;color:#9b9b93;">
  Este enlace caduca en <strong>24 horas</strong>. Si no creaste esta cuenta, ignora este email.
</p>
"""
    return await _send(to, "Confirma tu cuenta en BrainMind", _base_template(content, "Verifica tu email"))


async def send_appointment_confirmed(to: str, name: str, scheduled_at: datetime,
                                      duration_min: int, psychologist_name: str,
                                      video_url: str) -> bool:
    date_str = scheduled_at.strftime("%A, %d de %B de %Y")
    time_str = scheduled_at.strftime("%H:%M")
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">¡Cita confirmada! ✓</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, tu sesión con <strong>{psychologist_name}</strong> ha sido confirmada.
</p>
<table cellpadding="0" cellspacing="0" style="background:#f0ede8;border-radius:12px;padding:20px 24px;margin:0 0 24px;width:100%;">
  <tr><td>
    <p style="margin:0 0 6px;font-size:13px;color:#9b9b93;text-transform:uppercase;letter-spacing:0.5px;">Fecha y hora</p>
    <p style="margin:0;font-size:17px;font-weight:600;color:#1a1a18;">{date_str} a las {time_str}</p>
    <p style="margin:4px 0 0;font-size:14px;color:#6b6b63;">Duración: {duration_min} minutos</p>
  </td></tr>
</table>
{_btn("Entrar a la sesión", f"{settings.frontend_url}/dashboard/appointments")}
<p style="margin:0;font-size:13px;color:#9b9b93;">
  La videollamada estará disponible el día de la sesión.
</p>
"""
    return await _send(to, f"Cita confirmada — {date_str} a las {time_str}",
                       _base_template(content, "Cita confirmada"))


async def send_appointment_reminder(to: str, name: str, scheduled_at: datetime,
                                     duration_min: int, other_party_name: str,
                                     role: str, hours_before: int) -> bool:
    date_str = scheduled_at.strftime("%A, %d de %B")
    time_str = scheduled_at.strftime("%H:%M")
    when = "en 1 hora" if hours_before == 1 else "mañana"
    party_label = "tu paciente" if role == "psychologist" else "tu psicólogo/a"
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Tienes una sesión {when} 🗓️</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, te recordamos que tienes una sesión con {party_label}
  <strong>{other_party_name}</strong>.
</p>
<table cellpadding="0" cellspacing="0" style="background:#f0ede8;border-radius:12px;padding:20px 24px;margin:0 0 24px;width:100%;">
  <tr><td>
    <p style="margin:0 0 6px;font-size:13px;color:#9b9b93;text-transform:uppercase;letter-spacing:0.5px;">Cuándo</p>
    <p style="margin:0;font-size:17px;font-weight:600;color:#1a1a18;">{date_str} a las {time_str}</p>
    <p style="margin:4px 0 0;font-size:14px;color:#6b6b63;">{duration_min} minutos</p>
  </td></tr>
</table>
{_btn("Ver mi agenda", f"{settings.frontend_url}/dashboard/appointments")}
"""
    subject = f"Recordatorio: sesión {when} a las {time_str}"
    return await _send(to, subject, _base_template(content, "Recordatorio de sesión"))


async def send_soap_ready(to: str, name: str, patient_name: str,
                           appointment_id: str, session_date: datetime) -> bool:
    date_str = session_date.strftime("%d de %B")
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Resumen IA disponible 🧠</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, el resumen SOAP de la sesión del {date_str}
  con <strong>{patient_name}</strong> ya está listo para revisar.
</p>
{_btn("Ver resumen de sesión", f"{settings.frontend_url}/dashboard/session/{appointment_id}", "#6b4fa0")}
<p style="margin:0;font-size:13px;color:#9b9b93;">
  Puedes editar el resumen y generar el plan de ejercicios desde ahí.
</p>
"""
    return await _send(to, f"Resumen IA listo — sesión del {date_str}",
                       _base_template(content, "Resumen IA disponible"))


async def send_exercises_assigned(to: str, name: str, psychologist_name: str,
                                   appointment_id: str, num_exercises: int) -> bool:
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Tu plan de ejercicios está listo 💪</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, <strong>{psychologist_name}</strong> te ha asignado
  <strong>{num_exercises} ejercicio{"s" if num_exercises != 1 else ""}</strong>
  para practicar entre sesiones.
</p>
{_btn("Ver mis ejercicios", f"{settings.frontend_url}/dashboard/exercises/{appointment_id}")}
<p style="margin:0;font-size:13px;color:#9b9b93;">
  Confirma que los has leído para que tu psicólogo/a sepa que los tienes.
</p>
"""
    return await _send(to, "Tu psicólogo/a te ha asignado ejercicios",
                       _base_template(content, "Ejercicios asignados"))


async def send_rgpd_export_ready(to: str, name: str, export_url: str) -> bool:
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Tu export de datos está listo</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, hemos preparado el export completo de tus datos
  tal como establece el artículo 20 del RGPD (portabilidad de datos).
</p>
{_btn("Descargar mis datos", export_url)}
<p style="margin:16px 0 0;font-size:13px;color:#9b9b93;">
  ⚠️ Este enlace caduca en <strong>7 días</strong> por seguridad.
  El archivo contiene todos tus datos personales, historial de sesiones
  y preferencias en formato JSON.
</p>
"""
    return await _send(to, "Tu export de datos RGPD está listo",
                       _base_template(content, "Export de datos listo"))


async def send_account_deletion_confirmation(to: str, name: str) -> bool:
    content = f"""
<h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#1a1a18;">Cuenta eliminada</h1>
<p style="margin:0 0 24px;font-size:15px;color:#6b6b63;line-height:1.6;">
  Hola {name.split()[0]}, confirmamos que hemos eliminado permanentemente
  tu cuenta y todos tus datos de nuestros servidores, incluyendo los vectores
  de embeddings de tus sesiones, tal como establece el artículo 17 del RGPD
  (derecho al olvido).
</p>
<p style="margin:0;font-size:14px;color:#6b6b63;line-height:1.6;">
  Si tienes alguna duda sobre este proceso, puedes contactarnos en
  <a href="mailto:privacidad@brainmind.app" style="color:#2d4a3e;">privacidad@brainmind.app</a>.
</p>
"""
    return await _send(to, "Confirmación de eliminación de cuenta — BrainMind",
                       _base_template(content, "Cuenta eliminada"))
