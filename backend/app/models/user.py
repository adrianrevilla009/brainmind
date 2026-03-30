import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Boolean, Integer, Float, Text, DateTime,
    ForeignKey, Enum as SAEnum, ARRAY, Date, Time
)
from sqlalchemy.dialects.postgresql import UUID, INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class UserRole(str, enum.Enum):
    psychologist = "psychologist"
    patient = "patient"


class AppointmentStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    refunded = "refunded"
    failed = "failed"


class MatchStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"

class PreferredFrequency(str, enum.Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"
    flexible = "flexible"


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    psychologist_profile: Mapped["PsychologistProfile"] = relationship(back_populates="user", uselist=False)
    patient_profile: Mapped["PatientProfile"] = relationship(back_populates="user", uselist=False)
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")


class PsychologistProfile(Base):
    __tablename__ = "psychologist_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    license_number: Mapped[str | None] = mapped_column(String(100))
    license_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    specializations: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    approaches: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    languages: Mapped[list] = mapped_column(ARRAY(Text), default=["es"])
    session_price_eur: Mapped[int] = mapped_column(Integer, default=6000)
    session_duration_min: Mapped[int] = mapped_column(Integer, default=50)
    accepts_insurance: Mapped[bool] = mapped_column(Boolean, default=False)
    online_only: Mapped[bool] = mapped_column(Boolean, default=False)
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2), default="ES")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    stripe_account_id: Mapped[str | None] = mapped_column(String(255))
    stripe_onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="psychologist_profile")
    availability_slots: Mapped[list["AvailabilitySlot"]] = relationship(back_populates="psychologist")


class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_birth: Mapped[datetime | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2), default="ES")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    presenting_issues: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    previous_therapy: Mapped[bool] = mapped_column(Boolean, default=False)
    therapy_goals: Mapped[str | None] = mapped_column(Text)
    preferred_approach: Mapped[str | None] = mapped_column(Text)
    preferred_frequency: Mapped[PreferredFrequency] = mapped_column(SAEnum(PreferredFrequency, name="session_frequency"), nullable=False)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50))
    consent_data_processing: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_ai_analysis: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_transcription: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pseudo_token: Mapped[str] = mapped_column(String(64), unique=True)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="patient_profile")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id"))
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id"))
    status: Mapped[MatchStatus] = mapped_column(SAEnum(MatchStatus, name="match_status"), default=MatchStatus.pending)
    compatibility_score: Mapped[float | None] = mapped_column(Float)
    match_reasons: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    initiated_by: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    appointments: Mapped[list["Appointment"]] = relationship(back_populates="match")


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id"))
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id"))
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id"))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[AppointmentStatus] = mapped_column(SAEnum(AppointmentStatus, name="appointment_status"), default=AppointmentStatus.pending)
    video_room_url: Mapped[str | None] = mapped_column(Text)
    notes_psychologist: Mapped[str | None] = mapped_column(Text)
    session_summary: Mapped[str | None] = mapped_column(Text)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    match: Mapped[Match] = relationship(back_populates="appointments")
    payment: Mapped["Payment"] = relationship(back_populates="appointment", uselist=False)


class AvailabilitySlot(Base):
    __tablename__ = "availability_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id"))
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[datetime] = mapped_column(Time, nullable=False)
    end_time: Mapped[datetime] = mapped_column(Time, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    psychologist: Mapped[PsychologistProfile] = relationship(back_populates="availability_slots")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id"))
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id"))
    amount_eur: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_fee_eur: Mapped[int] = mapped_column(Integer, nullable=False)
    psychologist_amount_eur: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_transfer_id: Mapped[str | None] = mapped_column(String(255))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    appointment: Mapped[Appointment] = relationship(back_populates="payment")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    extra_data: Mapped[dict | None] = mapped_column(JSONB)  # 'metadata' es reservado en SQLAlchemy
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="notifications")


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReminderStatus(str, enum.Enum):
    pending   = "pending"
    sent      = "sent"
    failed    = "failed"
    cancelled = "cancelled"


class AppointmentReminder(Base):
    __tablename__ = "appointment_reminders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    reminder_type: Mapped[str] = mapped_column(String(50), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[ReminderStatus] = mapped_column(SAEnum(ReminderStatus, name="reminder_status"), default=ReminderStatus.pending)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SessionAnalytic(Base):
    __tablename__ = "session_analytics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id", ondelete="CASCADE"))
    psychologist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id", ondelete="CASCADE"))
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mood_score: Mapped[float | None] = mapped_column(Float)
    anxiety_score: Mapped[float | None] = mapped_column(Float)
    progress_score: Mapped[float | None] = mapped_column(Float)
    key_topics: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    exercise_completion_rate: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RgpdRequest(Base):
    __tablename__ = "rgpd_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    request_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reason: Mapped[str | None] = mapped_column(Text)
    export_url: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ═══════════════════════════════════════════════════════════════════
# Iteración 6 — Chat, Push, Subscriptions, Reviews
# ═══════════════════════════════════════════════════════════════════

class SubscriptionPlan(str, enum.Enum):
    free   = "free"
    pro    = "pro"
    clinic = "clinic"

class SubscriptionStatus(str, enum.Enum):
    active    = "active"
    cancelled = "cancelled"
    past_due  = "past_due"
    trialing  = "trialing"


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id   : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"))
    sender_id  : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id",   ondelete="CASCADE"))
    content    : Mapped[str]       = mapped_column(Text, nullable=False)
    msg_type   : Mapped[str]       = mapped_column(String(20), default="text")
    read_at    : Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at : Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id         : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    endpoint   : Mapped[str]       = mapped_column(Text, unique=True, nullable=False)
    p256dh     : Mapped[str]       = mapped_column(Text, nullable=False)
    auth       : Mapped[str]       = mapped_column(Text, nullable=False)
    user_agent : Mapped[str | None]= mapped_column(Text)
    created_at : Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id                     : Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    psychologist_id        : Mapped[uuid.UUID]          = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id", ondelete="CASCADE"))
    plan                   : Mapped[SubscriptionPlan]   = mapped_column(SAEnum(SubscriptionPlan,   name="subscription_plan"),   default=SubscriptionPlan.free)
    status                 : Mapped[SubscriptionStatus] = mapped_column(SAEnum(SubscriptionStatus, name="subscription_status"), default=SubscriptionStatus.active)
    stripe_subscription_id : Mapped[str | None]         = mapped_column(String(255), unique=True)
    stripe_customer_id     : Mapped[str | None]         = mapped_column(String(255))
    current_period_start   : Mapped[datetime | None]    = mapped_column(DateTime(timezone=True))
    current_period_end     : Mapped[datetime | None]    = mapped_column(DateTime(timezone=True))
    cancel_at_period_end   : Mapped[bool]               = mapped_column(Boolean, default=False)
    trial_end              : Mapped[datetime | None]    = mapped_column(DateTime(timezone=True))
    created_at             : Mapped[datetime]           = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at             : Mapped[datetime]           = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Review(Base):
    __tablename__ = "reviews"

    id              : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id      : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patient_profiles.id",      ondelete="CASCADE"))
    psychologist_id : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("psychologist_profiles.id", ondelete="CASCADE"))
    appointment_id  : Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id",          ondelete="CASCADE"), unique=True)
    rating          : Mapped[int]       = mapped_column(Integer, nullable=False)
    comment         : Mapped[str | None]= mapped_column(Text)
    is_anonymous    : Mapped[bool]      = mapped_column(Boolean, default=False)
    is_visible      : Mapped[bool]      = mapped_column(Boolean, default=True)
    created_at      : Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=utcnow)
