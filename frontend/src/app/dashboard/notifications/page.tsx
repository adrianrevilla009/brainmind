'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Calendar, Brain, Dumbbell, Users, Info } from 'lucide-react'

const TYPE_ICON: Record<string, any> = {
  appointment_created:   Calendar,
  appointment_confirmed: Calendar,
  session_completed:     Brain,
  exercise_assigned:     Dumbbell,
  match_accepted:        Users,
  info:                  Info,
}

const TYPE_COLOR: Record<string, string> = {
  appointment_created:   'bg-blue-100 text-blue-600',
  appointment_confirmed: 'bg-green-100 text-green-600',
  session_completed:     'bg-purple-100 text-purple-600',
  exercise_assigned:     'bg-brand-100 text-brand-600',
  match_accepted:        'bg-teal-100 text-teal-600',
  info:                  'bg-gray-100 text-gray-500',
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'Ahora mismo'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  return `Hace ${Math.floor(diff / 86400)} días`
}

export default function NotificationsPage() {
  const router = useRouter()
  const qc = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll().then(r => r.data),
    refetchInterval: 30_000,
  })

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOne = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const handleClick = (n: any) => {
    if (!n.is_read) markOne.mutate(n.id)
    if (n.action_url) router.push(n.action_url)
  }

  const unread = notifications.filter((n: any) => !n.is_read).length

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Notificaciones
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {unread > 0 ? `${unread} sin leer` : 'Todo al día'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium">
            <CheckCheck size={16} />
            Marcar todo como leído
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : notifications.length === 0 ? (
        <div className="card p-16 text-center">
          <Bell size={40} className="text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">No tienes notificaciones aún</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => {
            const Icon = TYPE_ICON[n.type] || Info
            const colorClass = TYPE_COLOR[n.type] || TYPE_COLOR.info
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left card p-4 flex items-start gap-4 transition-all hover:shadow-md ${
                  !n.is_read ? 'border-l-4 border-l-brand-500' : 'opacity-70'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {n.title}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && (
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                  )}
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1 flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
