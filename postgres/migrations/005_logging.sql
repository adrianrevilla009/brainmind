-- BrainMind — Migración 005: Logging y monitoreo

-- ── Tabla de logs de aplicación (errores críticos persistentes) ───────────────
CREATE TABLE IF NOT EXISTS app_logs (
    id          BIGSERIAL PRIMARY KEY,
    level       VARCHAR(20)  NOT NULL DEFAULT 'error',  -- debug|info|warning|error|critical
    source      VARCHAR(50)  NOT NULL DEFAULT 'backend', -- backend | frontend | scheduler
    logger      VARCHAR(100),
    message     TEXT         NOT NULL,
    context     JSONB,
    request_id  VARCHAR(20),
    user_id     UUID,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_logs_level      ON app_logs (level, created_at DESC);
CREATE INDEX idx_app_logs_source     ON app_logs (source, created_at DESC);
CREATE INDEX idx_app_logs_created    ON app_logs (created_at DESC);
CREATE INDEX idx_app_logs_user       ON app_logs (user_id) WHERE user_id IS NOT NULL;

-- Auto-purge: borrar logs > 90 días (ejecutar con pg_cron o cron externo)
-- SELECT cron.schedule('purge-old-logs', '0 3 * * *',
--   $$DELETE FROM app_logs WHERE created_at < NOW() - INTERVAL '90 days'$$);

-- ── Vista de errores recientes (útil para monitoring dashboard) ───────────────
CREATE OR REPLACE VIEW v_recent_errors AS
SELECT
    id,
    source,
    message,
    context,
    request_id,
    user_id,
    created_at
FROM app_logs
WHERE level IN ('error', 'critical')
  AND created_at > NOW() - INTERVAL '24h'
ORDER BY created_at DESC;

-- ── Métricas de uso por día (vista materializable) ────────────────────────────
CREATE OR REPLACE VIEW v_daily_metrics AS
SELECT
    DATE(created_at)                                            AS day,
    COUNT(*)                                                    AS total_events,
    COUNT(*) FILTER (WHERE level = 'error')                     AS errors,
    COUNT(*) FILTER (WHERE level = 'warning')                   AS warnings,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)  AS unique_users
FROM app_logs
WHERE created_at > NOW() - INTERVAL '30d'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- ── Índice GIN en context para búsquedas rápidas en JSONB ────────────────────
CREATE INDEX IF NOT EXISTS idx_app_logs_context ON app_logs USING gin(context);

COMMENT ON TABLE app_logs IS
  'Log centralizado de eventos de aplicación. Se purga automáticamente cada 90 días.';
