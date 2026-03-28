# BrainMind 🧠

Plataforma de apoyo psicológico con IA. Matching inteligente, videollamadas, transcripción local, resúmenes clínicos SOAP, analytics de evolución y cumplimiento RGPD completo.

## Stack (Iter 1–4)

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Backend | FastAPI (Python 3.12) |
| Base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT + verificación por email |
| Pagos | Stripe Connect |
| Videollamada | Jitsi Meet (meet.jit.si en dev, self-hosted en prod) |
| LLM local | Ollama + mistral:7b |
| LLM producción | Claude API (Anthropic) |
| Embeddings RAG | nomic-embed-text (Ollama) |
| Vector store | Qdrant |
| Transcripción | faster-whisper (local, CPU) |
| Email | Resend (3.000/mes gratis) |
| Orquestación | Docker Compose |

---

## Arranque rápido

```bash
cp .env.example .env
docker-compose up --build
```

Sin `RESEND_API_KEY` en `.env`: las cuentas se auto-verifican y los emails se loguean en consola — ideal para desarrollo.

### Acceso

| Servicio | URL |
|---------|-----|
| App | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Qdrant | http://localhost:6333/dashboard |
| Ollama | http://localhost:11434 |

---

## Feature flags

| Variable | Dev (defecto) | Producción |
|----------|--------------|------------|
| `LLM_PROVIDER` | `ollama` (mistral:7b, gratis) | `claude` |
| `WHISPER_MODE` | `mock` (simulado) | `local` |
| `JITSI_BASE_URL` | `https://meet.jit.si` | `https://meet.tudominio.com` |
| `RESEND_API_KEY` | vacío (auto-verificar) | clave real |

---

## Flujo completo

### Registro y verificación
1. Usuario se registra → se envía email de verificación (si Resend configurado)
2. Clic en enlace → cuenta activada → redirige al onboarding
3. Sin Resend: cuenta auto-verificada, flujo directo

### Sesión clínica completa
1. Paciente crea cita → psicólogo confirma → emails de confirmación y recordatorios (24h y 1h antes)
2. Día de la sesión: ambos entran a `/dashboard/video/{id}` → abren Jitsi en nueva pestaña
3. Psicólogo graba audio con el botón de la app → finaliza sesión
4. Flujo IA: sube audio → Whisper transcribe → LLM genera SOAP con RAG → genera ejercicios
5. Analytics: LLM extrae scores de mood/ansiedad/progreso del SOAP → gráficas de evolución
6. Paciente ve ejercicios → confirma lectura → psicólogo recibe notificación
7. Emails automáticos: "resumen listo" al psicólogo, "ejercicios asignados" al paciente

### RGPD self-service
- `/dashboard/rgpd`: export completo de datos (JSON), eliminación de cuenta con confirmación
- Borrado en cascada: BD + vectores Qdrant (pseudo_token)
- Emails de confirmación para export y borrado

---

## Endpoints nuevos (Iter 4)

```
GET  /api/auth/verify-email?token=...  Verificar email
POST /api/auth/resend-verification     Reenviar email de verificación

GET  /api/analytics/my-progress        Evolución del paciente (propio)
GET  /api/analytics/patients/{id}      Evolución de un paciente (psicólogo)

POST /api/rgpd/my-data                 Solicitar export de datos
GET  /api/rgpd/requests                Historial de solicitudes RGPD
DELETE /api/rgpd/delete-account        Eliminar cuenta permanentemente
GET  /api/rgpd/download/{filename}     Descargar export (dev)
```

---

## Emails implementados

| Trigger | Destinatario | Plantilla |
|---------|-------------|-----------|
| Registro | Usuario | Verificación de cuenta |
| Cita confirmada | Paciente | Confirmación con fecha/hora |
| 24h antes de cita | Paciente + Psicólogo | Recordatorio |
| 1h antes de cita | Paciente + Psicólogo | Recordatorio urgente |
| Resumen IA listo | Psicólogo | Link al SOAP |
| Ejercicios asignados | Paciente | Link al plan |
| Export RGPD listo | Usuario | Link de descarga (7 días) |
| Cuenta eliminada | Usuario | Confirmación de borrado |

---

## Próximas iteraciones

### Iteración 5 — Notificaciones push + WhatsApp/SMS
- n8n para flujos complejos y scheduling avanzado
- Twilio para SMS/WhatsApp
- Notificaciones push en navegador (Web Push API)
- Recordatorios de ejercicios entre sesiones

### Iteración 6 — Stripe real + marketplace
- Flujo de pago completo antes de confirmar cita
- Stripe Connect onboarding para psicólogos
- Dashboard de facturación y comisiones
- Reembolsos automáticos en cancelaciones

---

## Comandos útiles

```bash
# Descargar modelos Ollama (primera vez)
docker-compose --profile init up ollama-init

# Aplicar migraciones manualmente (si BD ya existe)
docker-compose exec postgres psql -U brainmind -d brainmind \
  -f /docker-entrypoint-initdb.d/004_iter4.sql

# Ver logs del scheduler de emails
docker-compose logs -f backend | grep -i "reminder\|email\|scheduler"

# Reset completo
docker-compose down -v
```
