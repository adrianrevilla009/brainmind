'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { initMonitoring } from '@/lib/monitoring'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: {
        onError: (error: any) => {
          // Log errores de mutaciones al backend automáticamente
          import('@/lib/monitoring').then(({ logError }) => {
            logError('React Query mutation error', {
              message: error?.message,
              status: error?.response?.status,
            })
          })
        },
      },
    },
  }))

  useEffect(() => {
    initMonitoring()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
