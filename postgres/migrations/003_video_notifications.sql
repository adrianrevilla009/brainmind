-- BrainMind — Migración 003: Iteración 3
-- Videollamada Jitsi self-hosted + notificaciones en app

-- Añadir proveedor de vídeo y URL de sala a appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS video_provider VARCHAR(20) DEFAULT 'jitsi',
  ADD COLUMN IF NOT EXISTS jitsi_room_name VARCHAR(255);

-- Notificaciones en app (reemplaza el stub de iter 1)
-- La tabla ya existía en 001 pero sin el campo action_url
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) DEFAULT 'info';

-- Índice para notificaciones no leídas (consulta más frecuente)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;
