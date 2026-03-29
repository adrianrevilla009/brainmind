/**
 * BrainMind — Monitoring del lado cliente.
 *
 * Captura errores JS no controlados y los envía al backend
 * para centralizar los logs en un único lugar.
 *
 * Uso:
 *   import { initMonitoring, logError } from '@/lib/monitoring'
 *   initMonitoring()  // en providers.tsx o layout.tsx raíz
 */

import { api } from './api'

const THROTTLE_MS = 5_000
let lastSent = 0

async function sendLog(level: 'error' | 'warn' | 'info', message: string, context?: object) {
  // Throttle: no más de 1 log cada 5s
  const now = Date.now()
  if (now - lastSent < THROTTLE_MS) return
  lastSent = now

  try {
    await api.post('/monitoring/log', {
      level,
      message: message.slice(0, 500),
      context,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : undefined,
    })
  } catch {
    // Silenciar — no queremos loops de error
  }
}

export function logError(message: string, context?: object) {
  console.error('[BrainMind]', message, context)
  sendLog('error', message, context)
}

export function logWarn(message: string, context?: object) {
  console.warn('[BrainMind]', message, context)
  sendLog('warn', message, context)
}

export function initMonitoring() {
  if (typeof window === 'undefined') return

  // Captura errores JS globales no controlados
  window.addEventListener('error', (event) => {
    sendLog('error', event.message || 'Uncaught error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 500),
    })
  })

  // Captura promesas rechazadas sin catch
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error
      ? reason.message
      : String(reason).slice(0, 300)
    sendLog('error', `Unhandled promise rejection: ${message}`, {
      stack: reason?.stack?.slice(0, 500),
    })
  })

  console.log('[BrainMind] Monitoring inicializado')
}
