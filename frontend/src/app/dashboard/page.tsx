'use client'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store'
import { appointmentsApi, matchesApi } from '@/lib/api'
import { formatDateTime, formatPrice } from '@/lib/utils'
import Link from 'next/link'
import { Calendar, Users, ArrowRight, Clock, Video } from 'lucide-react'

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode
}) {
  return (
    <div className="card p-7 card-hover animate-fade-in-up">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${color.replace('text-', 'bg-').replace('600', '100').replace('700', '100')}`}>
          {icon}
        </div>
      </div>
      <p className={`text-5xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-sm text-gray-400 mt-2">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const role = useAuthStore((s) => s.role)

  const { data: appointments } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => appointmentsApi.getMyAppointments().then((r) => r.data),
  })

  const { data: matches } = useQuery({
    queryKey: ['matches'],
    queryFn: () => matchesApi.getMyMatches().then((r) => r.data),
  })

  const upcoming = (appointments || [])
    .filter((a: any) => new Date(a.scheduled_at) > new Date() && a.status !== 'cancelled')
    .slice(0, 3)

  const acceptedMatches = (matches || []).filter((m: any) => m.status === 'accepted')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
          {role === 'psychologist' ? 'Tu consulta' : 'Tu espacio BrainMind'}
        </h1>
        <p className="page-subtitle">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <StatCard
          label="Próximas citas"
          value={upcoming.length}
          sub="en los próximos días"
          color="text-brand-600"
          icon={<Calendar size={20} className="text-brand-600" />}
        />
        <StatCard
          label={role === 'psychologist' ? 'Pacientes activos' : 'Psicólogos conectados'}
          value={acceptedMatches.length}
          color="text-sage-600"
          icon={<Users size={20} className="text-sage-600" />}
        />
        <StatCard
          label="Citas totales"
          value={(appointments || []).length}
          color="text-gray-700"
          icon={<Clock size={20} className="text-gray-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximas citas */}
        <div className="card p-7">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar size={20} className="text-brand-500" />
              Próximas citas
            </h2>
            <Link href="/dashboard/appointments" className="text-sm text-brand-600 hover:underline font-semibold flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-10">
              <Clock size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-base text-gray-500">No tienes citas próximas</p>
              <Link href={role === 'patient' ? '/dashboard/matches' : '/dashboard/appointments'}
                className="text-sm text-brand-600 hover:underline mt-2 block font-semibold">
                {role === 'patient' ? 'Busca un psicólogo →' : 'Gestiona tu agenda →'}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt: any) => (
                <div key={appt.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Calendar size={20} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900">Sesión de {appt.duration_min} min</p>
                    <p className="text-sm text-gray-500">{formatDateTime(appt.scheduled_at)}</p>
                  </div>
                  <span className={`badge ${appt.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Matches / Pacientes */}
        <div className="card p-7">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-sage-500" />
              {role === 'psychologist' ? 'Solicitudes pendientes' : 'Tus psicólogos'}
            </h2>
            <Link href={role === 'patient' ? '/dashboard/matches' : '/dashboard/patients'}
              className="text-sm text-brand-600 hover:underline font-semibold flex items-center gap-1">
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>

          {(matches || []).length === 0 ? (
            <div className="text-center py-10">
              <Users size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-base text-gray-500">
                {role === 'patient' ? 'Aún no tienes psicólogos asignados' : 'No hay solicitudes pendientes'}
              </p>
              {role === 'patient' && (
                <Link href="/dashboard/matches" className="text-sm text-brand-600 hover:underline mt-2 block font-semibold">
                  Generar matches →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(matches || []).slice(0, 4).map((match: any) => (
                <div key={match.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0 text-sage-700 font-bold text-lg">
                    {match.psychologist?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900 truncate">
                      {match.psychologist?.full_name || 'Psicólogo'}
                    </p>
                    {match.compatibility_score && (
                      <p className="text-sm text-gray-500">{Math.round(match.compatibility_score * 100)}% compatibilidad</p>
                    )}
                  </div>
                  <span className={`badge ${
                    match.status === 'accepted' ? 'bg-green-100 text-green-700'
                    : match.status === 'pending' ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                    {match.status === 'accepted' ? 'Activo' : match.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
