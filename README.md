# BrainMind 🧠

Plataforma de apoyo psicológico con IA. Conecta psicólogos y pacientes, gestiona citas, videollamadas self-hosted, transcripción local y resúmenes clínicos generados por LLM.

## Stack completo (Iter 1-3)

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Backend | FastAPI (Python 3.12) |
| Base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (python-jose) |
| Pagos | Stripe Connect |
| Videollamada | **Jitsi Meet self-hosted** (gratuito) |
| LLM local (dev) | **Ollama + mistral:7b** |
| LLM producción | Claude API (Anthropic) |
| Embeddings RAG | nomic-embed-text (Ollama) |
| Vector store | Qdrant |
| Transcripción | faster-whisper (local, CPU) |
| Orquestación | Docker Compose |

---

## Arranque rápido

```bash
cp .env.example .env
docker-compose up --build
```

Primera vez: Jitsi tarda ~2 min en arrancar. Ollama descarga modelos automáticamente con `--profile init`.

## Acceso

| Servicio | URL |
|---------|-----|
| App (frontend) | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Jitsi (videollamada) | http://localhost:8443 |
| Qdrant dashboard | http://localhost:6333/dashboard |
| Ollama API | http://localhost:11434 |

---

## Feature flags

| Variable | Dev (defecto) | Producción |
|----------|--------------|------------|
| `LLM_PROVIDER` | `ollama` (mistral:7b) | `claude` |
| `WHISPER_MODE` | `mock` (transcripción simulada) | `local` |
| `JITSI_BASE_URL` | `http://localhost:8443` | `https://meet.tudominio.com` |

---

## Flujo completo (Iter 3)

### Psicólogo
1. Registro → Onboarding (bio, precio, especializaciones)
2. Dashboard → acepta solicitudes de pacientes
3. Paciente crea cita → psicólogo la confirma → notificación al paciente
4. **"Entrar a la sesión"** → sala Jitsi embebida en la app
5. Graba audio con el micrófono del navegador (botón en la cabecera)
6. **"Finalizar sesión"** → cita marcada como `completed`
7. **"Resumen IA"** → sube audio → Whisper transcribe → LLM genera SOAP con RAG → genera ejercicios
8. **"Historial clínico"** del paciente con todas las sesiones y resúmenes

### Paciente
1. Registro → Onboarding (motivos, objetivos, consentimientos RGPD)
2. Genera matches → acepta psicólogo → crea cita
3. Notificación cuando la cita es confirmada
4. **"Entrar a la sesión"** → sala Jitsi
5. Tras la sesión → **"Mis ejercicios"** → confirma lectura del plan

---

## Endpoints nuevos (Iter 3)

```
PATCH /api/appointments/{id}/complete        Finalizar sesión (psicólogo)
GET   /api/notifications/                    Listar notificaciones
GET   /api/notifications/unread-count        Badge sidebar
PATCH /api/notifications/read-all            Marcar todas leídas
PATCH /api/notifications/{id}/read           Marcar una leída
```

---

## Jitsi en producción

Para producción con HTTPS (necesario para micrófono/cámara):

1. Apunta un subdominio a tu servidor: `meet.tudominio.com`
2. Añade un certificado SSL (Let's Encrypt)
3. Actualiza en `.env`:
   ```
   JITSI_BASE_URL=https://meet.tudominio.com
   DOCKER_HOST_ADDRESS=IP_PUBLICA_DEL_SERVIDOR
   ```
4. Abre puerto UDP 10000 en el firewall

---

## Comandos útiles

```bash
# Primera vez: descargar modelos Ollama
docker-compose --profile init up ollama-init

# Logs
docker-compose logs -f backend
docker-compose logs -f jitsi

# Reset completo (pierde modelos descargados)
docker-compose down -v
```
