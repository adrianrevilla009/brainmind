-- BrainMind — Schema principal
-- Migración 001: schema completo MVP

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos enumerados
CREATE TYPE user_role AS ENUM ('psychologist', 'patient');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE match_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE session_frequency AS ENUM ('weekly', 'biweekly', 'monthly', 'flexible');

-- Usuarios base
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perfil psicólogo
CREATE TABLE psychologist_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    bio TEXT,
    license_number VARCHAR(100),
    license_verified BOOLEAN DEFAULT false,
    specializations TEXT[] DEFAULT '{}',
    approaches TEXT[] DEFAULT '{}',   -- TCC, sistémica, psicodinámica...
    languages TEXT[] DEFAULT '{es}',
    session_price_eur INTEGER NOT NULL DEFAULT 6000, -- en céntimos
    session_duration_min INTEGER DEFAULT 50,
    accepts_insurance BOOLEAN DEFAULT false,
    online_only BOOLEAN DEFAULT false,
    city VARCHAR(100),
    country VARCHAR(2) DEFAULT 'ES',
    avatar_url TEXT,
    calendar_url TEXT,
    stripe_account_id VARCHAR(255),
    stripe_onboarded BOOLEAN DEFAULT false,
    ai_summary TEXT,                  -- generado por Claude
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perfil paciente
CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(50),
    city VARCHAR(100),
    country VARCHAR(2) DEFAULT 'ES',
    avatar_url TEXT,
    -- Historial clínico (sensible — acceso solo su psicólogo asignado)
    presenting_issues TEXT[] DEFAULT '{}',
    previous_therapy BOOLEAN DEFAULT false,
    therapy_goals TEXT,
    preferred_approach TEXT,
    preferred_frequency session_frequency DEFAULT 'weekly',
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    -- Consentimientos RGPD granulares
    consent_data_processing BOOLEAN DEFAULT false,
    consent_ai_analysis BOOLEAN DEFAULT false,
    consent_transcription BOOLEAN DEFAULT false,
    consent_date TIMESTAMPTZ,
    -- Seudonimización: token opaco para llamadas a APIs externas
    pseudo_token VARCHAR(64) UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    ai_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches psicólogo-paciente
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    psychologist_id UUID NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
    status match_status DEFAULT 'pending',
    compatibility_score FLOAT,        -- 0-1 calculado por matching engine
    match_reasons TEXT[],             -- por qué se propuso este match
    initiated_by user_role NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(patient_id, psychologist_id)
);

-- Citas
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id),
    psychologist_id UUID NOT NULL REFERENCES psychologist_profiles(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_min INTEGER DEFAULT 50,
    status appointment_status DEFAULT 'pending',
    video_room_url TEXT,
    notes_psychologist TEXT,          -- notas privadas del psicólogo
    session_summary TEXT,             -- resumen generado por IA (con consentimiento)
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disponibilidad del psicólogo
CREATE TABLE availability_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    psychologist_id UUID NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=lunes
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagos
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id),
    psychologist_id UUID NOT NULL REFERENCES psychologist_profiles(id),
    amount_eur INTEGER NOT NULL,      -- en céntimos
    platform_fee_eur INTEGER NOT NULL, -- comisión BrainMind (5%)
    psychologist_amount_eur INTEGER NOT NULL,
    status payment_status DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_transfer_id VARCHAR(255),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log RGPD (inmutable)
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    extra_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notificaciones
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT false,
    extra_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_psychologist ON appointments(psychologist_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_matches_patient ON matches(patient_id);
CREATE INDEX idx_matches_psychologist ON matches(psychologist_id);
CREATE INDEX idx_payments_appointment ON payments(appointment_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_psych_profiles_updated_at BEFORE UPDATE ON psychologist_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_patient_profiles_updated_at BEFORE UPDATE ON patient_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
