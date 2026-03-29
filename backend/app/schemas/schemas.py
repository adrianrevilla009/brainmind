from app.models.user import PreferredFrequency
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any
from datetime import datetime
import uuid


# --- Auth ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = Field(pattern="^(psychologist|patient)$")
    full_name: str = Field(min_length=2, max_length=255)


class LoginRequest(BaseModel):
    username: EmailStr  # OAuth2 usa "username"
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


# --- Perfil Psicólogo ---
class PsychologistProfileCreate(BaseModel):
    bio: Optional[str] = None
    license_number: Optional[str] = None
    specializations: list[str] = []
    approaches: list[str] = []
    languages: list[str] = ["es"]
    session_price_eur: int = Field(default=6000, ge=1000)  # mínimo €10
    session_duration_min: int = Field(default=50, ge=30, le=120)
    accepts_insurance: bool = False
    online_only: bool = False
    city: Optional[str] = None
    country: str = "ES"


class PsychologistProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    bio: Optional[str]
    license_number: Optional[str]
    license_verified: bool
    specializations: list[str]
    approaches: list[str]
    languages: list[str]
    session_price_eur: int
    session_duration_min: int
    accepts_insurance: bool
    online_only: bool
    city: Optional[str]
    country: str
    avatar_url: Optional[str]
    stripe_onboarded: bool
    ai_summary: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# --- Perfil Paciente ---
class PatientProfileCreate(BaseModel):
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    country: str = "ES"
    presenting_issues: list[str] = []
    previous_therapy: bool = False
    therapy_goals: Optional[str] = None
    preferred_approach: Optional[str] = None
    preferred_frequency: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    consent_data_processing: bool = False
    consent_ai_analysis: bool = False
    consent_transcription: bool = False


class PatientProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    gender: Optional[str]
    city: Optional[str]
    country: str
    presenting_issues: list[str]
    previous_therapy: bool
    therapy_goals: Optional[str]
    preferred_approach: Optional[str]
    preferred_frequency: Optional[str]
    consent_data_processing: bool
    consent_ai_analysis: bool
    consent_transcription: bool
    ai_summary: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# --- Matches ---
class MatchOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    psychologist_id: uuid.UUID
    status: str
    compatibility_score: Optional[float]
    match_reasons: list[str]
    initiated_by: str
    created_at: datetime
    psychologist: Optional[Any] = None

    class Config:
        from_attributes = True


class MatchStatusUpdate(BaseModel):
    status: str = Field(pattern="^(accepted|rejected)$")


# --- Citas ---
class AppointmentCreate(BaseModel):
    match_id: uuid.UUID
    scheduled_at: datetime
    duration_min: int = 50


class AppointmentOut(BaseModel):
    id: uuid.UUID
    match_id: uuid.UUID
    patient_id: uuid.UUID
    psychologist_id: uuid.UUID
    scheduled_at: datetime
    duration_min: int
    status: str
    video_room_url: Optional[str]
    session_summary: Optional[str]
    notes_psychologist: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Disponibilidad ---
class AvailabilitySlotCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str  # "HH:MM"
    end_time: str


class AvailabilitySlotOut(BaseModel):
    id: uuid.UUID
    day_of_week: int
    start_time: str
    end_time: str
    is_active: bool

    class Config:
        from_attributes = True


# --- Pagos ---
class PaymentIntentCreate(BaseModel):
    appointment_id: uuid.UUID


class PaymentIntentOut(BaseModel):
    client_secret: str
    payment_id: uuid.UUID
    amount_eur: int
    platform_fee_eur: int


# --- Notificaciones ---
class NotificationOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: Optional[str]
    is_read: bool
    extra_data: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True
