# BrainMind v5 — Plataforma de Psicología Clínica con IA

## Iteración 5 — Resumen de cambios

| # | Mejora | Estado |
|---|--------|--------|
| 1 | Verificación de email obligatoria para activar cuenta | ✅ |
| 2 | Recordatorios automáticos 24h/1h via Resend funcionando | ✅ |
| 3 | Lista de sesiones ordenada más reciente primero | ✅ |
| 4 | UI mejorada: texto más grande, animaciones, skeletons | ✅ |
| 5 | Stack de observabilidad completo (Prometheus + Loki + Tempo + Grafana) | ✅ |

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 · TypeScript · Tailwind CSS |
| Backend | FastAPI · Python 3.12 · SQLAlchemy async |
| Base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Vectores (RAG) | Qdrant |
| LLM | Ollama (dev) / Claude API (prod) |
| Transcripción | faster-whisper |
| Email | Resend |
| Videollamada | Jitsi Meet self-hosted |
| Pagos | Stripe |
| Métricas | Prometheus + prometheus-fastapi-instrumentator |
| Logs | Loki + Promtail |
| Trazas | OpenTelemetry → otel-collector → Tempo |
| Dashboards | Grafana (4 dashboards pre-configurados) |

---

## Arranque rápido

```bash
cp .env.example .env
# Editar .env con tus claves (mínimo: POSTGRES_PASSWORD, SECRET_KEY)

docker compose up -d --build

# Esperar ~45s y visitar:
#   App:     http://localhost:3000
#   Grafana: http://localhost:3001  (admin / brainmind)
#   API docs: http://localhost:8000/docs
```

### Primera vez (migración de BD)
Las migraciones se aplican automáticamente al arrancar postgres
porque están en `./postgres/migrations/` montado como initdb.

### Actualización desde v4
```bash
docker compose down
# Reemplazar código con v5, mantener .env
docker compose up -d postgres
# En PowerShell (una línea):
docker cp .\postgres\migrations\005_logging.sql brainmind_db:/tmp/005.sql
docker exec brainmind_db psql -U brainmind -d brainmind -f /tmp/005.sql
docker compose up -d --build
```

---

## Observabilidad

**Grafana → http://localhost:3001** (admin / brainmind)

4 dashboards listos desde el primer arranque:
- **HTTP & Sistema** — requests/s, latencia p50/p95/p99, errores, DB, Redis
- **Negocio** — usuarios, citas por estado, recordatorios
- **Logs** — búsqueda en tiempo real sobre todos los contenedores
- **Trazas** — mapa de servicios, spans, TraceQL interactivo

Los tres pilares están correlacionados: desde un log puedes saltar a la traza,
desde una traza puedes ver los logs del mismo request.

Ver `MONITORING.md` para documentación completa.

---

## Variables de entorno clave (.env)

```env
POSTGRES_PASSWORD=brainmind_dev_password
SECRET_KEY=genera_con_openssl_rand_hex_32

# Email (verificación de cuenta)
RESEND_API_KEY=re_xxxxxxxx
FROM_EMAIL=noreply@tudominio.com

# LLM
LLM_PROVIDER=ollama          # o "claude" en producción
ANTHROPIC_API_KEY=           # solo si LLM_PROVIDER=claude

# Entorno (cambia formato de logs)
ENVIRONMENT=development      # o "production"

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
