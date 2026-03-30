'use client'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  LineChart, Line, AreaChart, Area, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Activity, TrendingUp, Brain, Dumbbell } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const COLORS = {
  mood:     '#3366f4',
  anxiety:  '#ef4444',
  progress: '#10b981',
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-clinical-400 text-sm">
      <div className="text-center">
        <Activity size={28} className="mx-auto mb-2 text-clinical-200" />
        {label}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const role = useAuthStore(s => s.role)

  const { data: progress, isLoading } = useQuery({
    queryKey: ['my-progress'],
    queryFn: () => analyticsApi.myProgress().then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-32" />)}
        </div>
        <div className="skeleton h-64" />
      </div>
    )
  }

  const sessions = progress?.sessions || []
  const stats    = progress?.stats    || {}

  // Datos para la línea de evolución
  const evolutionData = sessions.map((s: any) => ({
    label: s.session_date
      ? format(new Date(s.session_date), 'd MMM', { locale: es })
      : `Sesión ${s.session_number}`,
    mood:     s.mood_score     ? Math.round(s.mood_score * 10) : null,
    anxiety:  s.anxiety_score  ? Math.round(s.anxiety_score * 10) : null,
    progress: s.progress_score ? Math.round(s.progress_score * 10) : null,
  })).filter((d: any) => d.mood !== null || d.anxiety !== null || d.progress !== null)

  // Radar de áreas trabajadas
  const topics = progress?.top_topics || []
  const radarData = topics.slice(0, 6).map((t: any) => ({
    topic: t.topic?.slice(0, 18) || 'Tema',
    value: t.count || 0,
  }))

  // Adherencia ejercicios
  const adherenceData = sessions
    .filter((s: any) => s.exercise_completion_rate !== null)
    .map((s: any) => ({
      label: `S${s.session_number}`,
      adherencia: Math.round((s.exercise_completion_rate || 0) * 100),
    }))

  return (
    <div className="space-y-8 anim-slide-up">
      <div>
        <h1 className="page-title">{role === 'psychologist' ? 'Analytics clínico' : 'Mi evolución'}</h1>
        <p className="page-subtitle">{sessions.length} sesiones registradas</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {[
          {
            label: 'Sesiones totales',
            value: stats.total_sessions ?? sessions.length,
            icon: <Brain size={16} />,
            color: 'bg-brand-100 text-brand-600',
          },
          {
            label: 'Mood promedio',
            value: stats.avg_mood ? `${(stats.avg_mood * 10).toFixed(0)}/10` : '—',
            icon: <TrendingUp size={16} />,
            color: 'bg-emerald-100 text-emerald-600',
          },
          {
            label: 'Ansiedad promedio',
            value: stats.avg_anxiety ? `${(stats.avg_anxiety * 10).toFixed(0)}/10` : '—',
            icon: <Activity size={16} />,
            color: 'bg-red-100 text-red-500',
          },
          {
            label: 'Adherencia ejercicios',
            value: stats.avg_exercise_rate
              ? `${Math.round(stats.avg_exercise_rate * 100)}%`
              : '—',
            icon: <Dumbbell size={16} />,
            color: 'bg-purple-100 text-purple-600',
          },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="stat-card anim-slide-up">
            <div className="flex items-center justify-between">
              <p className="stat-label">{label}</p>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
            </div>
            <p className="stat-value">{value}</p>
          </div>
        ))}
      </div>

      {/* Evolución emocional */}
      <div className="card p-6 anim-slide-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-bold text-clinical-900">Evolución por sesión</p>
            <p className="text-xs text-clinical-400 mt-0.5">Puntuaciones extraídas de los resúmenes SOAP (0–100)</p>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-brand-500 inline-block" />
              Mood
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              Ansiedad
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
              Progreso
            </span>
          </div>
        </div>
        {evolutionData.length < 2 ? (
          <EmptyChart label="Necesitas al menos 2 sesiones con SOAP generado" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={evolutionData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <defs>
                {(['mood', 'anxiety', 'progress'] as const).map(key => (
                  <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[key]} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS[key]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#627d98' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#627d98' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '1px solid #d9e2ec', fontSize: 12 }}
                formatter={(v: any) => [`${v}/100`]}
              />
              <Area type="monotone" dataKey="mood"     stroke={COLORS.mood}     fill={`url(#grad-mood)`}     strokeWidth={2} dot={{ r: 4 }} connectNulls />
              <Area type="monotone" dataKey="anxiety"  stroke={COLORS.anxiety}  fill={`url(#grad-anxiety)`}  strokeWidth={2} dot={{ r: 4 }} connectNulls />
              <Area type="monotone" dataKey="progress" stroke={COLORS.progress} fill={`url(#grad-progress)`} strokeWidth={2} dot={{ r: 4 }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar temas */}
        <div className="card p-6 anim-slide-up">
          <p className="font-bold text-clinical-900 mb-1">Áreas trabajadas</p>
          <p className="text-xs text-clinical-400 mb-5">Temas recurrentes en sesiones</p>
          {radarData.length < 3 ? (
            <EmptyChart label="Genera SOAPs para ver los temas trabajados" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="topic" tick={{ fontSize: 10, fill: '#627d98' }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} />
                <Radar name="Frecuencia" dataKey="value" stroke="#3366f4" fill="#3366f4" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Adherencia ejercicios */}
        <div className="card p-6 anim-slide-up">
          <p className="font-bold text-clinical-900 mb-1">Adherencia a ejercicios</p>
          <p className="text-xs text-clinical-400 mb-5">% de ejercicios completados por sesión</p>
          {adherenceData.length === 0 ? (
            <EmptyChart label="Sin datos de ejercicios aún" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={adherenceData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <defs>
                  <linearGradient id="grad-adh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#627d98' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#627d98' }}
                  tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #d9e2ec', fontSize: 12 }}
                  formatter={(v: any) => [`${v}%`, 'Adherencia']}
                />
                <Area type="monotone" dataKey="adherencia" stroke="#10b981" fill="url(#grad-adh)"
                  strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
