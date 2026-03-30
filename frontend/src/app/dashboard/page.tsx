'use client'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store'
import { appointmentsApi, matchesApi, analyticsApi } from '@/lib/api'
import Link from 'next/link'
import {
  Calendar, Users, ArrowRight, Clock, TrendingUp,
  MessageSquare, Star, Activity, CheckCircle, AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function StatCard({ label, value, delta, color, icon, href }: {
  label: string; value: string | number; delta?: string
  color: string; icon: React.ReactNode; href?: string
}) {
  const content = (
    <div className="stat-card card-hover h-full">
      <div className="flex items-center justify-between">
        <p className="stat-label">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="stat-value">{value}</p>
      {delta && <p className="stat-delta-up text-xs"><TrendingUp size={11} />{delta}</p>}
    </div>
  )
  return href
    ? <Link href={href} className="block h-full">{content}</Link>
    : <div className="h-full">{content}</div>
}

function AppointmentRow({ a, role }: { a: any; role: string | null }) {
  const statusStyle: Record<string, string> = {
    pending:   'badge-amber',
    confirmed: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-gray',
  }
  const statusLabel: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmada',
    completed: 'Completada', cancelled: 'Cancelada',
  }
  return (
    <Link
      href={`/dashboard/appointments`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-clinical-50 transition-colors border-b border-clinical-50 last:border-b-0"
    >
      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
        <Calendar size={16} className="text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-clinical-900">
          {format(new Date(a.scheduled_at), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        <p className="text-xs text-clinical-400 mt-0.5">
          {format(new Date(a.scheduled_at), 'HH:mm')} · {a.duration_min} min
        </p>
      </div>
      <span className={statusStyle[a.status] || 'badge-gray'}>{statusLabel[a.status]}</span>
    </Link>
  )
}

export default function DashboardPage() {
  const role = useAuthStore(s => s.role)

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => appointmentsApi.getMyAppointments().then(r => r.data),
  })
  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => matchesApi.getMyMatches().then(r => r.data),
  })
  const { data: progress } = useQuery({
    queryKey: ['progress'],
    queryFn: () => analyticsApi.myProgress().then(r => r.data),
  })

  const upcoming = (appointments as any[])
    .filter(a => new Date(a.scheduled_at) > new Date() && a.status !== 'cancelled')
    .slice(0, 5)
  const accepted = (matches as any[]).filter(m => m.status === 'accepted')
  const completed = (appointments as any[]).filter(a => a.status === 'completed')
  const pending   = (appointments as any[]).filter(a => a.status === 'pending')

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 13) return 'Buenos días'
    if (h < 20) return 'Buenas tardes'
    return 'Buenas noches'
  }

  return (
    <div className="space-y-8 anim-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-clinical-900">
            {greeting()} 👋
          </h1>
          <p className="text-clinical-500 mt-1 text-sm">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
          </p>
        </div>
        {upcoming.length > 0 && (
          <div className="card-clinical px-4 py-3 flex items-center gap-3">
            <AlertCircle size={16} className="text-white/80" />
            <div>
              <p className="text-xs text-white/70 font-medium">Próxima cita</p>
              <p className="text-white font-bold text-sm">
                {format(new Date(upcoming[0].scheduled_at), "d MMM 'a las' HH:mm", { locale: es })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatCard
          label="Próximas citas"
          value={upcoming.length}
          color="bg-brand-100 text-brand-600"
          icon={<Calendar size={16} />}
          href="/dashboard/appointments"
        />
        <StatCard
          label={role === 'psychologist' ? 'Pacientes activos' : 'Psicólogos'}
          value={accepted.length}
          color="bg-emerald-100 text-emerald-600"
          icon={<Users size={16} />}
          href={role === 'psychologist' ? '/dashboard/patients' : '/dashboard/matches'}
        />
        <StatCard
          label="Completadas"
          value={completed.length}
          color="bg-purple-100 text-purple-600"
          icon={<CheckCircle size={16} />}
        />
        <StatCard
          label="Pendientes"
          value={pending.length}
          color="bg-amber-100 text-amber-600"
          icon={<Clock size={16} />}
        />
      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Próximas citas */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label">Próximas citas</p>
            <Link href="/dashboard/appointments" className="text-xs text-brand-600 font-semibold flex items-center gap-1 hover:underline">
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
          <div className="card overflow-hidden">
            {upcoming.length === 0 ? (
              <div className="p-12 text-center">
                <Calendar size={36} className="text-clinical-200 mx-auto mb-3" />
                <p className="text-sm text-clinical-400">No hay citas próximas</p>
                {role === 'patient' && (
                  <Link href="/dashboard/matches" className="btn-primary btn-sm mt-4 inline-flex">
                    Encontrar psicólogo
                  </Link>
                )}
              </div>
            ) : (
              <div className="stagger">
                {upcoming.map(a => <AppointmentRow key={a.id} a={a} role={role} />)}
              </div>
            )}
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="space-y-4">
          <p className="section-label">Accesos rápidos</p>
          <div className="space-y-3 stagger">
            <Link href="/dashboard/chat" className="card-hover p-4 flex items-center gap-4 anim-slide-up">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
                <MessageSquare size={16} className="text-cyan-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-clinical-900">Mensajes</p>
                <p className="text-xs text-clinical-400">Chat entre sesiones</p>
              </div>
              <ArrowRight size={14} className="text-clinical-300" />
            </Link>

            <Link href="/dashboard/analytics" className="card-hover p-4 flex items-center gap-4 anim-slide-up">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Activity size={16} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-clinical-900">Analytics</p>
                <p className="text-xs text-clinical-400">Tu evolución</p>
              </div>
              <ArrowRight size={14} className="text-clinical-300" />
            </Link>

            {role === 'psychologist' && (
              <Link href="/dashboard/reviews" className="card-hover p-4 flex items-center gap-4 anim-slide-up">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Star size={16} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-clinical-900">Reseñas</p>
                  <p className="text-xs text-clinical-400">Valoraciones de pacientes</p>
                </div>
                <ArrowRight size={14} className="text-clinical-300" />
              </Link>
            )}

            {role === 'psychologist' && (
              <Link href="/dashboard/subscription" className="card-clinical p-4 flex items-center gap-4 anim-slide-up">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <TrendingUp size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">Suscripción</p>
                  <p className="text-xs text-white/70">Gestionar plan</p>
                </div>
                <ArrowRight size={14} className="text-white/60" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
