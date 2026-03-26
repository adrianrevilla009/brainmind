"""
Servicio de transcripción de audio.

Modos controlados por settings.whisper_mode:
  - 'local' → faster-whisper en CPU (gratuito, sin salida de datos)
  - 'mock'  → devuelve transcript de prueba (dev rápido sin modelo)
"""
import asyncio
import logging
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Cargamos el modelo una sola vez (solo si modo local)
_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        logger.info(f"Cargando modelo Whisper '{settings.whisper_model_size}'...")
        _whisper_model = WhisperModel(
            settings.whisper_model_size,
            device="cpu",
            compute_type="int8",
        )
        logger.info("Modelo Whisper cargado.")
    return _whisper_model


def _transcribe_sync(filepath: str) -> dict:
    """Transcripción síncrona — se ejecuta en executor para no bloquear."""
    model = _get_whisper_model()
    segments, info = model.transcribe(
        filepath,
        language="es",
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    full_text = " ".join(seg.text.strip() for seg in segments)
    return {
        "text": full_text.strip(),
        "language": info.language,
        "duration_seconds": info.duration,
    }


async def transcribe_audio(filepath: str) -> dict:
    """
    Transcribe un archivo de audio.
    Selecciona implementación según settings.whisper_mode.
    """
    if settings.whisper_mode == "mock":
        logger.info(f"[MOCK] Transcripción simulada para {filepath}")
        await asyncio.sleep(0.5)  # simular latencia
        return {
            "text": (
                "Psicólogo: ¿Cómo te has sentido esta semana? "
                "Paciente: Mejor que la anterior, aunque tuve dos días de mucha ansiedad. "
                "Psicólogo: ¿Qué crees que lo desencadenó? "
                "Paciente: El trabajo, principalmente. Las reuniones me generan mucho estrés. "
                "Psicólogo: Vamos a trabajar en técnicas de regulación para esas situaciones."
            ),
            "language": "es",
            "duration_seconds": 3120.0,  # 52 minutos simulados
        }

    # Modo local: faster-whisper
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _transcribe_sync, filepath)
    return result
