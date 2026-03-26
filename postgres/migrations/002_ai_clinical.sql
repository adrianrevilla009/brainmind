-- BrainMind — Migración 002: IA clínica (Iteración 2)
-- Transcripciones Whisper, resúmenes SOAP y planes de ejercicios.
-- Los vectores/embeddings se almacenan en Qdrant (contenedor separado),
-- aquí guardamos los metadatos y el qdrant_point_id para cruzar referencias.

CREATE TYPE transcript_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Transcripciones de sesión (audio procesado localmente con Whisper)
CREATE TABLE session_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    audio_filename TEXT,
    transcript_text TEXT,
    language VARCHAR(10),
    duration_seconds FLOAT,
    session_number INTEGER DEFAULT 1,
    status transcript_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resúmenes SOAP generados por LLM.
-- RGPD: patient_pseudo_token en lugar de FK a datos reales.
-- El embedding vive en Qdrant; aquí solo el ID del punto para buscarlo.
CREATE TABLE session_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    transcript_id UUID REFERENCES session_transcripts(id),
    patient_pseudo_token VARCHAR(64) NOT NULL,
    llm_provider VARCHAR(20) DEFAULT 'ollama',
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    raw_response TEXT,
    qdrant_point_id UUID,   -- ID del punto en Qdrant (para RAG)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Planes de ejercicios entre sesiones
CREATE TABLE exercise_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    summary_id UUID REFERENCES session_summaries(id),
    llm_provider VARCHAR(20) DEFAULT 'ollama',
    exercises JSONB NOT NULL DEFAULT '[]',
    frequency VARCHAR(100),
    notes TEXT,
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_transcripts_appointment  ON session_transcripts(appointment_id);
CREATE INDEX idx_summaries_appointment    ON session_summaries(appointment_id);
CREATE INDEX idx_summaries_pseudo_token   ON session_summaries(patient_pseudo_token);
CREATE INDEX idx_exercise_plans_patient   ON exercise_plans(patient_id);
CREATE INDEX idx_exercise_plans_appt      ON exercise_plans(appointment_id);

-- Trigger updated_at
CREATE TRIGGER update_transcripts_updated_at
    BEFORE UPDATE ON session_transcripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
