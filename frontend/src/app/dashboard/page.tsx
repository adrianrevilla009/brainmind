'use client'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/lib/store'
import { appointmentsApi, matchesApi } from '@/lib/api'
import { formatDateTime, formatPrice } from '@/lib/utils'
import Link from 'next/link'
import { Calendar, Users, ArrowRight, Clock } from 'lucide-react'

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-semibold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
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
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
          {role === 'psychologist' ? 'Tu consulta' : 'Tu espacio BrainMind'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Próximas citas"
          value={upcoming.length}
          sub="en los próximos días"
          color="text-brand-600"
        />
        <StatCard
          label={role === 'psychologist' ? 'Pacientes activos' : 'Psicólogos conectados'}
          value={acceptedMatches.length}
          color="text-sage-600"
        />
        <StatCard
          label="Citas totales"
          value={(appointments || []).length}
          color="text-gray-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximas citas */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Calendar size={16} className="text-brand-500" />
              Próximas citas
            </h2>
            <Link href="/dashboard/appointments" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8">
              <Clock size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No tienes citas próximas</p>
              <Link href={role === 'patient' ? '/dashboard/matches' : '/dashboard/appointments'}
                className="text-xs text-brand-600 hover:underline mt-1 block">
                {role === 'patient' ? 'Busca un psicólogo →' : 'Gestiona tu agenda →'}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appt: any) => (
                <div key={appt.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      Sesión de {appt.duration_min} min
                    </p>
                    <p className="text-xs text-gray-500">{formatDateTime(appt.scheduled_at)}</p>
                  </div>
                  <span className={`badge text-xs ${
                    appt.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Matches / Pacientes */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Users size={16} className="text-sage-500" />
              {role === 'psychologist' ? 'Solicitudes pendientes' : 'Tus psicólogos'}
            </h2>
            <Link href={role === 'patient' ? '/dashboard/matches' : '/dashboard/patients'}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>

          {(matches || []).length === 0 ? (
            <div className="text-center py-8">
              <Users size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {role === 'patient' ? 'Aún no tienes psicólogos asignados' : 'No hay solicitudes pendientes'}
              </p>
              {role === 'patient' && (
                <Link href="/dashboard/matches" className="text-xs text-brand-600 hover:underline mt-1 block">
                  Generar matches →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(matches || []).slice(0, 4).map((match: any) => (
                <div key={match.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0 text-sage-700 font-medium text-sm">
                    {match.psychologist?.full_name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {match.psychologist?.full_name || 'Psicólogo'}
                    </p>
                    {match.compatibility_score && (
                      <p className="text-xs text-gray-500">
                        {Math.round(match.compatibility_score * 100)}% compatibilidad
                      </p>
                    )}
                  </div>
                  <span className={`badge text-xs ${
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
