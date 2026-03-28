'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { TrendingUp, TrendingDown, Minus, Brain, Dumbbell, BarChart2 } from 'lucide-react'

function ScoreBar({ value, max = 10, color }: { value: number | null; max?: number; color: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-gray-400">—</span>
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-6 text-right">{value.toFixed(1)}</span>
    </div>
  )
}

function Trend({ sessions, key: k }: { sessions: any[]; key: string }) {
  if (sessions.length < 2) return null
  const last = sessions[sessions.length - 1][k]
  const prev = sessions[sessions.length - 2][k]
  if (!last || !prev) return null
  const diff = last - prev
  if (Math.abs(diff) < 0.3) return <Minus size={14} className="text-gray-400" />
  if (diff > 0) return <TrendingUp size={14} className="text-green-500" />
  return <TrendingDown size={14} className="text-red-500" />
}

export default function AnalyticsPage() {
  const role = useAuthStore(s => s.role)

  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get(
      role === 'patient' ? '/analytics/my-progress' : '/analytics/my-progress'
    ).then(r => r.data),
  })

  const sessions = data?.sessions || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Mi evolución
          </h1>
          <p className="text-gray-500 text-sm mt-1">Seguimiento de tu progreso terapéutico</p>
        </div>
        <div className="card p-16 text-center">
          <BarChart2 size={40} className="text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">
            Los datos de evolución aparecerán tras las primeras sesiones con resumen IA generado.
          </p>
        </div>
      </div>
    )
  }

  // Últimas métricas
  const last = sessions[sessions.length - 1]

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
          Mi evolución
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {sessions.length} sesión{sessions.length !== 1 ? 'es' : ''} registradas
        </p>
      </div>

      {/* Métricas actuales */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Estado anímico', key: 'mood_score', color: 'bg-blue-500', icon: '😊', good: 'alto' },
          { label: 'Ansiedad', key: 'anxiety_score', color: 'bg-amber-500', icon: '😰', good: 'bajo' },
          { label: 'Progreso', key: 'progress_score', color: 'bg-green-500', icon: '🎯', good: 'alto' },
        ].map(({ label, key, color, icon, good }) => (
          <div key={key} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{icon}</span>
              <Trend sessions={sessions} key={key} />
            </div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mb-2">
              {last[key] !== null && last[key] !== undefined ? last[key].toFixed(1) : '—'}
              <span className="text-sm font-normal text-gray-400">/10</span>
            </p>
            <ScoreBar value={last[key]} color={color} />
          </div>
        ))}
      </div>

      {/* Gráfica de evolución */}
      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-5">Evolución por sesión</h2>
        <div className="space-y-4">
          {sessions.map((s: any, i: number) => (
            <div key={i} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold text-gray-900">Sesión {s.session_number}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(s.session_date).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short',
                    })}
                  </span>
                </div>
                {s.exercise_completion_rate !== null && s.exercise_completion_rate !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.exercise_completion_rate >= 0.7
                      ? 'bg-green-100 text-green-700'
                      : s.exercise_completion_rate >= 0.4
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {Math.round(s.exercise_completion_rate * 100)}% ejercicios
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24">Estado anímico</span>
                  <div className="flex-1"><ScoreBar value={s.mood_score} color="bg-blue-400" /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24">Ansiedad</span>
                  <div className="flex-1"><ScoreBar value={s.anxiety_score} color="bg-amber-400" /></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24">Progreso</span>
                  <div className="flex-1"><ScoreBar value={s.progress_score} color="bg-green-400" /></div>
                </div>
              </div>
              {s.key_topics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {s.key_topics.map((t: string) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
