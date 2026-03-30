-- BrainMind — Migración 006: Chat, Push, Subscriptions, Reviews

-- ── Chat / Mensajería ─────────────────────────────────────────────────────────
CREATE TABLE chat_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    msg_type     VARCHAR(20) DEFAULT 'text',   -- text | system
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_match    ON chat_messages(match_id, created_at DESC);
CREATE INDEX idx_chat_sender   ON chat_messages(sender_id);
CREATE INDEX idx_chat_unread   ON chat_messages(match_id, read_at) WHERE read_at IS NULL;

-- ── Push Notifications ────────────────────────────────────────────────────────
CREATE TABLE push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL UNIQUE,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);

-- ── Suscripciones SaaS psicólogos ────────────────────────────────────────────
CREATE TYPE subscription_plan   AS ENUM ('free', 'pro', 'clinic');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');

CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    psychologist_id         UUID NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
    plan                    subscription_plan   DEFAULT 'free',
    status                  subscription_status DEFAULT 'active',
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    stripe_customer_id      VARCHAR(255),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN DEFAULT FALSE,
    trial_end               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sub_psychologist ON subscriptions(psychologist_id);
CREATE INDEX idx_sub_stripe       ON subscriptions(stripe_subscription_id);

-- Crear suscripción free por defecto para psicólogos existentes
INSERT INTO subscriptions (psychologist_id, plan, status)
SELECT id, 'free', 'active' FROM psychologist_profiles
ON CONFLICT DO NOTHING;

-- ── Reseñas y reputación ──────────────────────────────────────────────────────
CREATE TABLE reviews (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id       UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    psychologist_id  UUID NOT NULL REFERENCES psychologist_profiles(id) ON DELETE CASCADE,
    appointment_id   UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment          TEXT,
    is_anonymous     BOOLEAN DEFAULT FALSE,
    is_visible       BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(appointment_id)   -- una reseña por cita
);
CREATE INDEX idx_reviews_psychologist ON reviews(psychologist_id, created_at DESC);
CREATE INDEX idx_reviews_patient      ON reviews(patient_id);

-- Añadir campos de reputación al perfil del psicólogo
ALTER TABLE psychologist_profiles
    ADD COLUMN IF NOT EXISTS avg_rating    NUMERIC(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS review_count  INTEGER DEFAULT 0;

-- Función para actualizar rating automáticamente al insertar/borrar reseña
CREATE OR REPLACE FUNCTION update_psychologist_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE psychologist_profiles
    SET
        avg_rating   = (SELECT COALESCE(AVG(rating)::NUMERIC(3,2), 0) FROM reviews WHERE psychologist_id = COALESCE(NEW.psychologist_id, OLD.psychologist_id) AND is_visible = TRUE),
        review_count = (SELECT COUNT(*) FROM reviews WHERE psychologist_id = COALESCE(NEW.psychologist_id, OLD.psychologist_id) AND is_visible = TRUE)
    WHERE id = COALESCE(NEW.psychologist_id, OLD.psychologist_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_psychologist_rating();

-- ── Notificación del campo extra en notifications ─────────────────────────────
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS notification_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS action_url TEXT;
