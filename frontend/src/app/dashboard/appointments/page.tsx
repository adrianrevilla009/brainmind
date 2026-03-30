'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, matchesApi, reviewsApi } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Video, Plus, X, Check, Brain, Dumbbell, CheckCircle, Star } from 'lucide-react'

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
  const [reviewAppointmentId, setReviewAppointmentId] = useState<string | null>(null)

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: () => appointmentsApi.getMyAppointments(filter || undefined).then(r => r.data),
  })

  const { data: pendingReviews = [] } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: () => role === 'patient' ? reviewsApi.getPending().then(r => r.data) : Promise.resolve([]),
    enabled: role === 'patient',
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
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
            {role === 'psychologist' ? 'Agenda' : 'Mis citas'}
          </h1>
          <p className="page-subtitle">{appointments.length} citas en total</p>
        </div>
        {role === 'patient' && (
          <button onClick={() => setShowNewModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nueva cita
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {[['', 'Todas'], ['pending', 'Pendientes'], ['confirmed', 'Confirmadas'], ['completed', 'Completadas']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`px-5 py-2.5 rounded-2xl text-base font-semibold transition-all ${
              filter === val ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="skeleton h-28 w-full" style={{ animationDelay: `${i*80}ms` }} />
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <div className="card p-20 text-center animate-fade-in-up">
          <Calendar size={56} className="text-gray-200 mx-auto mb-5" />
          <p className="text-lg text-gray-500">No hay citas que mostrar</p>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section className="animate-fade-in-up">
              <p className="section-title">Próximas</p>
              <div className="space-y-4 stagger-children">
                {upcoming.map((a: any) => (
                  <AppointmentCard key={a.id} appointment={a} role={role}
                    onConfirm={() => confirm.mutate(a.id)}
                    onCancel={() => cancel.mutate(a.id)} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section className="animate-fade-in-up">
              <p className="section-title">Historial</p>
              <div className="space-y-4 stagger-children">
                {past.map((a: any) => (
                  <AppointmentCard key={a.id} appointment={a} role={role} past
                    pendingReviewIds={pendingReviews.map((r: any) => r.appointment_id)}
                    onReview={(id: string) => setReviewAppointmentId(id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showNewModal && <NewAppointmentModal onClose={() => setShowNewModal(false)} />}
      {reviewAppointmentId && (
        <ReviewModal
          appointmentId={reviewAppointmentId}
          onClose={() => {
            setReviewAppointmentId(null)
            qc.invalidateQueries({ queryKey: ['pending-reviews'] })
            qc.invalidateQueries({ queryKey: ['appointments'] })
          }}
        />
      )}
    </div>
  )
}

function AppointmentCard({ appointment: a, role, onConfirm, onCancel, past, pendingReviewIds = [], onReview }: any) {
  const router = useRouter()
  const qc     = useQueryClient()

  const complete = useMutation({
    mutationFn: () => fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/appointments/${a.id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${localStorage.getItem('brainmind_token')}` },
    }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  })

  return (
    <div className={`card p-6 flex gap-5 ${past ? 'opacity-60' : ''}`}>
      {/* Date block */}
      <div className="w-16 text-center flex-shrink-0">
        <div className="bg-brand-50 rounded-2xl p-3">
          <p className="text-sm text-brand-500 font-bold uppercase">
            {new Date(a.scheduled_at).toLocaleDateString('es-ES', { month: 'short' })}
          </p>
          <p className="text-3xl font-bold text-brand-700 leading-none mt-0.5">
            {new Date(a.scheduled_at).getDate()}
          </p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <span className="text-lg font-semibold text-gray-900">
              {formatTime(a.scheduled_at)}
            </span>
            <span className="text-base text-gray-500">· {a.duration_min} min</span>
          </div>
          <span className={`badge text-sm ${STATUS_STYLE[a.status] || 'bg-gray-100 text-gray-600'}`}>
            {STATUS_LABEL[a.status] || a.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {a.video_room_url && a.status === 'confirmed' && (
            <button onClick={() => router.push(`/dashboard/video/${a.id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
              <Video size={15} /> Entrar a la sesión
            </button>
          )}
          {role === 'psychologist' && a.status === 'pending' && (
            <button onClick={onConfirm}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700">
              <Check size={15} /> Confirmar
            </button>
          )}
          {role === 'psychologist' && a.status === 'confirmed' && (
            <button onClick={() => complete.mutate()} disabled={complete.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">
              <CheckCircle size={15} />
              {complete.isPending ? 'Finalizando...' : 'Finalizar sesión'}
            </button>
          )}
          {a.status !== 'cancelled' && a.status !== 'completed' && !past && (
            <button onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
              <X size={15} /> Cancelar
            </button>
          )}
          {a.status === 'completed' && role === 'psychologist' && (
            <button onClick={() => router.push(`/dashboard/session/${a.id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
              <Brain size={15} /> Resumen IA
            </button>
          )}
          {a.status === 'completed' && role === 'patient' && (
            <button onClick={() => router.push(`/dashboard/exercises/${a.id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
              <Dumbbell size={15} /> Mis ejercicios
            </button>
          )}
          {a.status === 'completed' && role === 'patient' && pendingReviewIds.includes(a.id) && (
            <button onClick={() => onReview(a.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">
              <Star size={15} /> Dejar reseña
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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Nueva cita</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-base px-4 py-3 rounded-2xl border border-red-200">{error}</div>}
          <div>
            <label className="label">Psicólogo</label>
            <select className="input" value={matchId} onChange={e => setMatchId(e.target.value)} required>
              <option value="">Selecciona un psicólogo</option>
              {accepted.map((m: any) => {
                const p = m.psychologist
                const name = p?.full_name || 'Psicólogo'
                const spec = p?.specializations?.[0] || p?.approaches?.[0] || ''
                const price = p?.session_price_eur ? `· ${(p.session_price_eur / 100).toFixed(0)}€` : ''
                return (
                  <option key={m.id} value={m.id}>
                    {name}{spec ? ` — ${spec}` : ''}{price}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
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

function ReviewModal({ appointmentId, onClose }: { appointmentId: string; onClose: () => void }) {
  const [rating, setRating]       = useState(0)
  const [hovered, setHovered]     = useState(0)
  const [comment, setComment]     = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  const handleSubmit = async () => {
    if (rating === 0) { setError('Selecciona una valoración'); return }
    setLoading(true); setError('')
    try {
      await reviewsApi.create({
        appointment_id: appointmentId,
        rating,
        comment: comment.trim() || undefined,
        is_anonymous: anonymous,
      })
      setDone(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al publicar la reseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        {done ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">¡Gracias por tu reseña!</p>
            <p className="text-sm text-gray-500 mt-1">Tu valoración ayuda a otros pacientes</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Valorar sesión</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-2xl border border-red-200 mb-4">{error}</div>
            )}

            {/* Estrellas */}
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(n)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      n <= (hovered || rating)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mb-6">
              {rating === 0 ? 'Toca una estrella para valorar' :
               rating === 1 ? 'Muy mala experiencia' :
               rating === 2 ? 'Mala experiencia' :
               rating === 3 ? 'Regular' :
               rating === 4 ? 'Buena experiencia' : '¡Excelente experiencia!'}
            </p>

            {/* Comentario */}
            <div className="mb-4">
              <label className="label">Comentario (opcional)</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Cuéntanos tu experiencia con el psicólogo..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={1000}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{comment.length}/1000</p>
            </div>

            {/* Anónimo */}
            <label className="flex items-center gap-3 cursor-pointer mb-6 select-none">
              <div
                onClick={() => setAnonymous(!anonymous)}
                className={`w-10 h-6 rounded-full transition-colors relative ${anonymous ? 'bg-brand-600' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${anonymous ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm text-gray-600">Publicar de forma anónima</span>
            </label>

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleSubmit} disabled={loading || rating === 0} className="btn-primary flex-1 flex justify-center">
                {loading ? 'Publicando...' : 'Publicar reseña'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}