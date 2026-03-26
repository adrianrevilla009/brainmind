'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, matchesApi } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Video, Plus, X, Check, Brain, Dumbbell, CheckCircle } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-600',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmada',
  cancelled: 'Cancelada', completed: 'Completada',
}

export default function AppointmentsPage() {
  const qc   = useQueryClient()
  const role = useAuthStore(s => s.role)
  const [showNewModal, setShowNewModal] = useState(false)
  const [filter, setFilter] = useState('')

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: () => appointmentsApi.getMyAppointments(filter || undefined).then(r => r.data),
  })

  const confirm = useMutation({
    mutationFn: (id: string) => appointmentsApi.confirm(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => appointmentsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })

  const upcoming = appointments.filter((a: any) =>
    new Date(a.scheduled_at) > new Date() && a.status !== 'cancelled'
  )
  const past = appointments.filter((a: any) =>
    new Date(a.scheduled_at) <= new Date() || a.status === 'cancelled'
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            {role === 'psychologist' ? 'Agenda' : 'Mis citas'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{appointments.length} citas en total</p>
        </div>
        {role === 'patient' && (
          <button onClick={() => setShowNewModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Nueva cita
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {[['', 'Todas'], ['pending', 'Pendientes'], ['confirmed', 'Confirmadas'], ['completed', 'Completadas']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === val ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : appointments.length === 0 ? (
        <div className="card p-16 text-center">
          <Calendar size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay citas que mostrar</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Próximas</h2>
              <div className="space-y-3">
                {upcoming.map((a: any) => (
                  <AppointmentCard key={a.id} appointment={a} role={role}
                    onConfirm={() => confirm.mutate(a.id)}
                    onCancel={() => cancel.mutate(a.id)} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Historial</h2>
              <div className="space-y-3">
                {past.map((a: any) => (
                  <AppointmentCard key={a.id} appointment={a} role={role} past />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showNewModal && <NewAppointmentModal onClose={() => setShowNewModal(false)} />}
    </div>
  )
}

function AppointmentCard({ appointment: a, role, onConfirm, onCancel, past }: any) {
  const router = useRouter()
  const qc     = useQueryClient()

  const complete = useMutation({
    mutationFn: () => fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/appointments/${a.id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('brainmind_token')}` },
    }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })

  const isNow = a.status === 'confirmed' &&
    Math.abs(new Date(a.scheduled_at).getTime() - Date.now()) < 2 * 60 * 60 * 1000

  return (
    <div className={`card p-4 flex gap-4 ${past ? 'opacity-70' : ''}`}>
      <div className="w-14 text-center flex-shrink-0">
        <div className="bg-brand-50 rounded-xl p-2">
          <p className="text-xs text-brand-500 font-medium uppercase">
            {new Date(a.scheduled_at).toLocaleDateString('es-ES', { month: 'short' })}
          </p>
          <p className="text-2xl font-semibold text-brand-700 leading-none">
            {new Date(a.scheduled_at).getDate()}
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-900">
              {formatTime(a.scheduled_at)} · {a.duration_min} min
            </span>
          </div>
          <span className={`badge text-xs ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[a.status] || a.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* Entrar a la sala de vídeo */}
          {a.video_room_url && a.status === 'confirmed' && (
            <button
              onClick={() => router.push(`/dashboard/video/${a.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
              <Video size={12} /> Entrar a la sesión
            </button>
          )}

          {/* Confirmar (psicólogo, pendiente) */}
          {role === 'psychologist' && a.status === 'pending' && (
            <button onClick={onConfirm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700">
              <Check size={12} /> Confirmar
            </button>
          )}

          {/* Finalizar sesión (psicólogo, confirmed, ≤2h de margen) */}
          {role === 'psychologist' && a.status === 'confirmed' && (
            <button onClick={() => complete.mutate()}
              disabled={complete.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
              <CheckCircle size={12} />
              {complete.isPending ? 'Finalizando...' : 'Finalizar sesión'}
            </button>
          )}

          {/* Cancelar */}
          {a.status !== 'cancelled' && a.status !== 'completed' && !past && (
            <button onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
              <X size={12} /> Cancelar
            </button>
          )}

          {/* Resumen IA (psicólogo, completed) */}
          {a.status === 'completed' && role === 'psychologist' && (
            <button onClick={() => router.push(`/dashboard/session/${a.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700">
              <Brain size={12} /> Resumen IA
            </button>
          )}

          {/* Ejercicios (paciente, completed) */}
          {a.status === 'completed' && role === 'patient' && (
            <button onClick={() => router.push(`/dashboard/exercises/${a.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700">
              <Dumbbell size={12} /> Mis ejercicios
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NewAppointmentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [matchId, setMatchId] = useState('')
  const [date, setDate]       = useState('')
  const [time, setTime]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => matchesApi.getMyMatches().then(r => r.data),
  })
  const accepted = matches.filter((m: any) => m.status === 'accepted')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!matchId || !date || !time) return
    setLoading(true); setError('')
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
      await appointmentsApi.create({ match_id: matchId, scheduled_at: scheduledAt })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al crear cita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">Nueva cita</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>}
          <div>
            <label className="label">Psicólogo</label>
            <select className="input" value={matchId} onChange={e => setMatchId(e.target.value)} required>
              <option value="">Selecciona un psicólogo</option>
              {accepted.map((m: any) => (
                <option key={m.id} value={m.id}>{m.psychologist?.full_name || 'Psicólogo'}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} required />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={time} onChange={e => setTime(e.target.value)} required />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex justify-center">
              {loading ? 'Creando...' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
