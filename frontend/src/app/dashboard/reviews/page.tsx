'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { reviewsApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Star, MessageSquare, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function StarRating({ value, onChange, readonly = false }: {
  value: number; onChange?: (v: number) => void; readonly?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(i)}
          onMouseEnter={() => !readonly && setHover(i)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={readonly ? 'cursor-default' : 'cursor-pointer'}
        >
          <Star
            size={readonly ? 14 : 22}
            className={`transition-colors ${
              i <= (hover || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-clinical-200'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function PendingReviewModal({ appointment, onClose, onSubmit }: any) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const qc = useQueryClient()

  const submit = useMutation({
    mutationFn: () => reviewsApi.create({
      appointment_id: appointment.appointment_id,
      rating, comment, is_anonymous: anonymous,
    }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-reviews'] })
      onSubmit()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card p-7 w-full max-w-md anim-scale-in">
        <h2 className="text-lg font-bold text-clinical-900 mb-1">Valorar sesión</h2>
        <p className="text-sm text-clinical-500 mb-5">
          Sesión con <strong>{appointment.psychologist_name}</strong> el{' '}
          {format(new Date(appointment.scheduled_at), "d 'de' MMMM", { locale: es })}
        </p>

        <div className="mb-5">
          <p className="label">¿Cómo fue tu experiencia?</p>
          <StarRating value={rating} onChange={setRating} />
        </div>

        <div className="mb-4">
          <label className="label">Comentario (opcional)</label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="Comparte tu experiencia para ayudar a otros pacientes..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={1000}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-clinical-600 mb-6 cursor-pointer">
          <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}
            className="rounded" />
          Publicar de forma anónima
        </label>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Ahora no</button>
          <button
            onClick={() => submit.mutate()}
            disabled={rating === 0 || submit.isPending}
            className="btn-primary flex-1"
          >
            {submit.isPending ? 'Enviando...' : 'Publicar reseña'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  const role = useAuthStore(s => s.role)
  const [reviewModal, setReviewModal] = useState<any>(null)
  const [submitted, setSubmitted] = useState(false)

  // Para pacientes: citas pendientes de reseñar
  const { data: pending = [] } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: () => reviewsApi.getPending().then(r => r.data),
    enabled: role === 'patient',
  })

  // Para psicólogos: sus reseñas
  const { data: profile } = useQuery({
    queryKey: ['psych-profile'],
    queryFn: () => import('@/lib/api').then(m => m.profilesApi.getPsychologistMe()).then(r => r.data),
    enabled: role === 'psychologist',
  })

  const { data: reviewData } = useQuery({
    queryKey: ['my-reviews'],
    queryFn: () => reviewsApi.getByPsychologist(profile.id).then(r => r.data),
    enabled: role === 'psychologist' && !!profile?.id,
  })

  // ── Vista PACIENTE ────────────────────────────────────────────────────────
  if (role === 'patient') {
    return (
      <div className="anim-slide-up max-w-2xl">
        <div className="mb-8">
          <h1 className="page-title">Mis reseñas</h1>
          <p className="page-subtitle">Valora tus sesiones completadas</p>
        </div>

        {submitted && (
          <div className="card p-4 bg-emerald-50 border-emerald-200 flex items-center gap-3 mb-5 anim-scale-in">
            <CheckCircle size={18} className="text-emerald-500" />
            <p className="text-sm text-emerald-700 font-medium">¡Reseña publicada! Gracias por tu opinión.</p>
          </div>
        )}

        {pending.length === 0 ? (
          <div className="card p-16 text-center">
            <Star size={40} className="text-clinical-200 mx-auto mb-3" />
            <p className="text-clinical-500 font-medium">No hay sesiones pendientes de valorar</p>
            <p className="text-sm text-clinical-400 mt-1">Las reseñas aparecen al completar una sesión</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {pending.map((a: any) => (
              <div key={a.appointment_id} className="card p-5 flex items-center justify-between anim-slide-up">
                <div>
                  <p className="font-semibold text-clinical-900">{a.psychologist_name}</p>
                  <p className="text-sm text-clinical-400 mt-0.5">
                    {format(new Date(a.scheduled_at), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>
                <button
                  onClick={() => { setSubmitted(false); setReviewModal(a) }}
                  className="btn-primary btn-sm"
                >
                  <Star size={13} />
                  Valorar
                </button>
              </div>
            ))}
          </div>
        )}

        {reviewModal && (
          <PendingReviewModal
            appointment={reviewModal}
            onClose={() => setReviewModal(null)}
            onSubmit={() => { setReviewModal(null); setSubmitted(true) }}
          />
        )}
      </div>
    )
  }

  // ── Vista PSICÓLOGO ───────────────────────────────────────────────────────
  const avg = reviewData?.avg_rating ?? 0
  const total = reviewData?.total ?? 0
  const dist = reviewData?.distribution ?? {}
  const reviews = reviewData?.reviews ?? []

  return (
    <div className="anim-slide-up max-w-3xl">
      <div className="mb-8">
        <h1 className="page-title">Mis reseñas</h1>
        <p className="page-subtitle">Lo que dicen tus pacientes</p>
      </div>

      {/* Stats */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-5xl font-extrabold text-clinical-900">{avg.toFixed(1)}</p>
            <StarRating value={Math.round(avg)} readonly />
            <p className="text-xs text-clinical-400 mt-1">{total} reseña{total !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5,4,3,2,1].map(n => {
              const count = dist[n] || 0
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={n} className="flex items-center gap-2">
                  <span className="text-xs text-clinical-500 w-4">{n}</span>
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <div className="flex-1 h-2 bg-clinical-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-clinical-400 w-4 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lista reseñas */}
      {reviews.length === 0 ? (
        <div className="card p-16 text-center">
          <MessageSquare size={40} className="text-clinical-200 mx-auto mb-3" />
          <p className="text-clinical-500">Aún no tienes reseñas</p>
          <p className="text-sm text-clinical-400 mt-1">Aparecerán cuando tus pacientes valoren las sesiones</p>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {reviews.map((r: any) => (
            <div key={r.id} className="card p-5 anim-slide-up">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-clinical-800 text-sm">{r.patient_name}</p>
                  <StarRating value={r.rating} readonly />
                </div>
                <span className="text-xs text-clinical-400">
                  {format(new Date(r.created_at), "d MMM yyyy", { locale: es })}
                </span>
              </div>
              {r.comment && (
                <p className="text-sm text-clinical-700 mt-2 leading-relaxed">"{r.comment}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
