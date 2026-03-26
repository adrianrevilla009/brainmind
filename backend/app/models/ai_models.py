"""
Modelos SQLAlchemy para la Iteración 2 — IA clínica.
Importar en app/models/__init__.py o directamente donde se necesiten.
"""
import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import (
    String, Boolean, Integer, Float, Text, DateTime,
    ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class TranscriptStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class SessionTranscript(Base):
    __tablename__ = "session_transcripts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"), unique=True)
    audio_filename: Mapped[str | None] = mapped_column(Text)
    transcript_text: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(String(10))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    session_number: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[TranscriptStatus] = mapped_column(
        SAEnum(TranscriptStatus, name="transcript_status"),
        default=TranscriptStatus.pending,
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    summary: Mapped["SessionSummary"] = relationship(back_populates="transcript", uselist=False)


class SessionSummary(Base):
    __tablename__ = "session_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"), unique=True)
    transcript_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("session_transcripts.id"))
    patient_pseudo_token: Mapped[str] = mapped_column(String(64))
    llm_provider: Mapped[str] = mapped_column(String(20), default="ollama")
    subjective: Mapped[str | None] = mapped_column(Text)
    objective: Mapped[str | None] = mapped_column(Text)
    assessment: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[str | None] = mapped_column(Text)
    # embedding: no mapeamos en SQLAlchemy (lo gestionamos con SQL raw via pgvector)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    transcript: Mapped[SessionTranscript] = relationship(back_populates="summary")
    exercise_plan: Mapped["ExercisePlan"] = relationship(back_populates="summary", uselist=False)


class ExercisePlan(Base):
    __tablename__ = "exercise_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id"))
    summary_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("session_summaries.id"))
    llm_provider: Mapped[str] = mapped_column(String(20), default="ollama")
    exercises: Mapped[dict] = mapped_column(JSONB, default=list)
    frequency: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    summary: Mapped[SessionSummary] = relationship(back_populates="exercise_plan")
