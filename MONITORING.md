# BrainMind — Sistema de Observabilidad Completo

## Stack

```
BrainMind API
  ├── /metrics ──────────────────────────────► Prometheus ──► Grafana
  ├── OTLP gRPC (trazas) ──► otel-collector ──► Tempo ───────► Grafana
  └── stdout (logs JSON) ──► Promtail ────────► Loki ─────────► Grafana

PostgreSQL ──► postgres-exporter ──► Prometheus ──► Grafana
Redis      ──► redis-exporter    ──► Prometheus ──► Grafana
```

## Acceso

| Servicio    | URL                       | Usuario  | Contraseña |
|-------------|---------------------------|----------|------------|
| **Grafana** | http://localhost:3001      | admin    | brainmind  |
| Prometheus  | http://localhost:9090      | —        | —          |
| Loki        | http://localhost:3100      | —        | —          |
| Tempo       | http://localhost:3200      | —        | —          |

## Dashboards en Grafana

Al entrar en Grafana → carpeta **BrainMind** → 4 dashboards pre-configurados:

### 1 · HTTP & Sistema
- Requests por segundo por ruta
- Latencia p50 / p95 / p99
- Errores 4xx y 5xx en tiempo real
- Tasa de error en gauge
- Conexiones activas a PostgreSQL
- Memoria usada por Redis

### 2 · Negocio
- Total usuarios y nuevos últimos 7 días
- Citas por estado (pie chart)
- Recordatorios pendientes / enviados / fallidos
- Citas completadas por día (bar chart)

### 3 · Logs
- Errores en tiempo real (Loki)
- Volumen de logs por nivel (error / warning / info)
- Logs de todos los servicios con búsqueda
- Errores de frontend capturados

### 4 · Trazas
- Mapa de servicios (dependencias automáticas)
- Duración de spans p95 por operación
- Spans con error
- Buscador TraceQL interactivo

## Correlaciones cruzadas

Los tres pilares están **correlacionados** en Grafana:

- **Traza → Logs**: desde una traza en Tempo, clic en "Ver logs" filtra Loki por `request_id`
- **Logs → Traza**: desde un log con `request_id`, clic abre la traza en Tempo
- **Métricas → Trazas**: desde un pico de latencia en Prometheus, clic en exemplar abre la traza exacta

## Métricas expuestas por el backend

### HTTP (automáticas via prometheus-fastapi-instrumentator)
```
http_requests_total{method, handler, status_code}
http_request_duration_seconds{method, handler}   ← histograma p50/p95/p99
http_requests_in_progress
```

### Negocio (custom, actualizadas cada 60s desde PostgreSQL)
```
brainmind_users_total
brainmind_new_users_7d
brainmind_appointments_total
brainmind_appointments_by_status{status}
brainmind_appointments_completed_total
brainmind_reminders_pending_total
brainmind_reminders_sent_total
brainmind_reminders_failed_total
```

### PostgreSQL (via postgres-exporter)
```
pg_stat_database_numbackends       ← conexiones activas
pg_stat_database_blks_hit          ← cache hits
pg_stat_database_xact_commit       ← transacciones/s
```

### Redis (via redis-exporter)
```
redis_memory_used_bytes
redis_connected_clients
redis_commands_processed_total
```

## Trazas distribuidas (OpenTelemetry)

El backend instrumenta automáticamente:
- **Todas las rutas FastAPI** → span por request con atributos HTTP
- **Todas las queries SQL** → span por query SQLAlchemy
- **Todas las llamadas HTTP salientes** → span por llamada httpx (Resend, Stripe, Ollama, Qdrant)

Buscar trazas en Grafana → Trazas → TraceQL:
```
# Todas las trazas de hoy
{ resource.service.name="brainmind-api" }

# Solo trazas lentas (>500ms)
{ resource.service.name="brainmind-api" && duration > 500ms }

# Solo trazas con error
{ resource.service.name="brainmind-api" && status = error }

# Ruta específica
{ span.http.route="/api/appointments/my" }
```

## Logs en Loki (LogQL)

```logql
# Todos los errores del backend
{service="backend"} | json | level="error"

# Logs de un request específico
{service="backend"} | json | request_id="a3f9b1c2"

# Errores del frontend capturados
{service="backend"} |= "FRONTEND"

# Logs de todos los servicios BrainMind
{project="brainmind_v5"}

# Requests lentos (>1000ms)
{service="backend"} | json | duration_ms > 1000
```

## Alertas recomendadas (configurar en Grafana → Alerting)

| Alerta                    | Condición                                      |
|---------------------------|------------------------------------------------|
| Error rate alto           | `rate(5xx) / rate(all) > 0.05` por 5min        |
| Latencia p99 alta         | `p99 > 2s` por 5min                            |
| BD sin conexión           | `pg_up == 0`                                   |
| Recordatorios fallidos    | `brainmind_reminders_failed_total > 5`         |
| Sin actividad             | `rate(http_requests_total[10m]) == 0`          |

## Retención de datos

| Sistema    | Retención por defecto |
|------------|-----------------------|
| Prometheus | 30 días               |
| Loki       | 30 días               |
| Tempo      | 7 días                |
| app_logs   | 90 días (PostgreSQL)  |
