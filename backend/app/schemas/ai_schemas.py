"""Schemas Pydantic para los endpoints de IA clínica."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class TranscriptStatusResponse(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    status: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    session_number: int
    created_at: datetime

    class Config:
        from_attributes = True


class TranscriptOut(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    transcript_text: Optional[str]
    language: Optional[str]
    duration_seconds: Optional[float]
    session_number: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SummaryOut(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    llm_provider: str
    subjective: Optional[str]
    objective: Optional[str]
    assessment: Optional[str]
    plan: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ExerciseItem(BaseModel):
    title: str
    description: str
    frequency: str
    duration_min: int


class ExercisePlanOut(BaseModel):
    id: uuid.UUID
    appointment_id: uuid.UUID
    patient_id: uuid.UUID
    llm_provider: str
    exercises: list  # list of ExerciseItem dicts
    frequency: Optional[str]
    notes: Optional[str]
    is_acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AcknowledgeRequest(BaseModel):
    acknowledged: bool = True
