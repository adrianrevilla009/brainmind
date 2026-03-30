'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { initMonitoring } from '@/lib/monitoring'

async function registerPush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const { pushApi } = await import('@/lib/api')
    const vapidRes = await pushApi.getVapidKey()
    const vapidKey = vapidRes.data?.key
    if (!vapidKey) return

    const existing = await reg.pushManager.getSubscription()
    if (existing) return  // ya suscrito

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    })

    const json = sub.toJSON()
    await pushApi.subscribe({
      endpoint:   sub.endpoint,
      p256dh:     (json.keys as any)?.p256dh || '',
      auth:       (json.keys as any)?.auth    || '',
      user_agent: navigator.userAgent,
    })
  } catch {
    // Silenciar — push es opcional
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries:   { retry: 1, staleTime: 30_000 },
      mutations: {
        onError: (error: any) => {
          import('@/lib/monitoring').then(({ logError }) => {
            logError('React Query mutation error', {
              message: error?.message,
              status:  error?.response?.status,
            })
          })
        },
      },
    },
  }))

  useEffect(() => {
    initMonitoring()
    // Intentar registrar push después de que el usuario esté autenticado
    // (lo llama el layout del dashboard, aquí solo registramos el SW)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
