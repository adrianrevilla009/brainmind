-- BrainMind — Migración 004: Iteración 4
-- Email verification, analytics, RGPD avanzado, Stripe real

-- ── Email verification ────────────────────────────────────────────────────────
CREATE TABLE email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_tokens_user ON email_verification_tokens(user_id);

-- ── Recordatorios de email programados ────────────────────────────────────────
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

CREATE TABLE appointment_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_type VARCHAR(50) NOT NULL,  -- '24h_before', '1h_before', 'summary_ready'
    scheduled_for TIMESTAMPTZ NOT NULL,
    status reminder_status DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_scheduled ON appointment_reminders(scheduled_for, status)
    WHERE status = 'pending';

-- ── Analytics de sesiones ─────────────────────────────────────────────────────
CREATE TABLE session_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    psychologist_id UUID NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id),
    session_number INTEGER NOT NULL,
    session_date DATE NOT NULL,
    -- Métricas extraídas del SOAP por LLM (escala 1-10, null si no disponible)
    mood_score FLOAT,
    anxiety_score FLOAT,
    progress_score FLOAT,
    -- Resumen de temas tratados
    key_topics TEXT[],
    exercise_completion_rate FLOAT,  -- % ejercicios completados de sesión anterior
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_patient ON session_analytics(patient_id, session_date);

-- ── RGPD: solicitudes de datos y borrado ──────────────────────────────────────
CREATE TYPE rgpd_request_type AS ENUM ('export', 'delete', 'restrict');
CREATE TYPE rgpd_request_status AS ENUM ('pending', 'processing', 'completed', 'rejected');

CREATE TABLE rgpd_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    request_type rgpd_request_type NOT NULL,
    status rgpd_request_status DEFAULT 'pending',
    reason TEXT,
    export_url TEXT,          -- URL firmada al export JSON (expira en 7 días)
    processed_at TIMESTAMPTZ,
    processed_by UUID,        -- admin que lo procesó (futuro)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rgpd_user ON rgpd_requests(user_id, created_at DESC);

-- ── Añadir campos útiles a tablas existentes ──────────────────────────────────
-- Stripe: guardar charge_id para refunds
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- Usuarios: campo para email de contacto alternativo (futuro SMS/WhatsApp)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
