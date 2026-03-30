'use client'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { aiApi } from '@/lib/api'
import { ArrowLeft, Brain, Dumbbell, CheckCircle, Clock, Star } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}
        />
      ))}
    </div>
  )
}

function SessionCard({ session, router }: { session: any; router: any }) {
  const { data: reviewData } = useQuery({
    queryKey: ['appointment-review', session.appointment_id],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/reviews/appointment/${session.appointment_id}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('brainmind_token')}` } }
      )
      if (!res.ok) return null
      return res.json()
    },
    enabled: session.status === 'completed',
    retry: false,
  })

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-900">
            {new Date(session.scheduled_at).toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
        </div>
        <span className={`badge text-xs ${
          session.status === 'completed' ? 'bg-gray-100 text-gray-600' :
          session.status === 'confirmed'  ? 'bg-green-100 text-green-700' :
          'bg-amber-100 text-amber-700'
        }`}>
          {session.status === 'completed' ? 'Completada' :
           session.status === 'confirmed'  ? 'Confirmada' : session.status}
        </span>
      </div>

      {/* SOAP */}
      {session.summary ? (
        <>
          <div className="flex items-center gap-1.5 mb-3">
            <Brain size={13} className="text-purple-500" />
            <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Resumen SOAP</span>
            <span className="ml-auto text-xs text-gray-400 font-mono">
              {session.summary.llm_provider === 'ollama' ? 'Ollama' : 'Claude API'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { key: 'subjective', label: 'S', color: 'blue' },
              { key: 'objective',  label: 'O', color: 'purple' },
              { key: 'assessment', label: 'A', color: 'amber' },
              { key: 'plan',       label: 'P', color: 'green' },
            ].map(({ key, label, color }) => (
              <div key={key} className={`bg-${color}-50 rounded-lg p-3`}>
                <p className={`text-xs font-bold text-${color}-600 mb-1`}>{label}</p>
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
                  {session.summary[key] || '—'}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-400 italic mb-3">Sin resumen SOAP generado</p>
      )}

      {/* Ejercicios */}
      {session.exercise_plan && (
        <div className="border-t border-gray-100 pt-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Dumbbell size={13} className="text-brand-500" />
              <span className="text-xs font-semibold text-brand-600">
                {session.exercise_plan.exercises?.length ?? 0} ejercicios asignados
              </span>
            </div>
            {session.exercise_plan.is_acknowledged && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle size={11} /> Visto por el paciente
              </span>
            )}
          </div>
          {session.exercise_plan.frequency && (
            <p className="text-xs text-gray-500 mt-1">{session.exercise_plan.frequency}</p>
          )}
        </div>
      )}

      {/* Reseña del paciente */}
      {session.status === 'completed' && (
        <div className="border-t border-gray-100 pt-3">
          {reviewData ? (
            <div className="flex items-start gap-3">
              <Star size={13} className="text-amber-400 fill-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StarRating rating={reviewData.rating} />
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {reviewData.patient_name || 'Paciente anónimo'}
                  </span>
                </div>
                {reviewData.comment && (
                  <p className="text-xs text-gray-600 leading-relaxed">{reviewData.comment}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
              <Star size={12} className="text-gray-300" />
              El paciente aún no ha dejado reseña
            </p>
          )}
        </div>
      )}

      {/* Link al flujo IA si está completada pero sin summary */}
      {session.status === 'completed' && !session.summary && (
        <button
          onClick={() => router.push(`/dashboard/session/${session.appointment_id}`)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-purple-200 text-purple-600 text-xs font-medium hover:bg-purple-50 transition-colors">
          <Brain size={13} /> Generar resumen IA
        </button>
      )}
    </div>
  )
}

export default function PatientHistoryPage() {
  const { id: patientId } = useParams() as { id: string }
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['patient-history', patientId],
    queryFn: () => aiApi.getPatientHistory(patientId).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Historial clínico
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data?.total_sessions ?? 0} sesiones registradas
          </p>
        </div>
      </div>

      {(!data?.history || data.history.length === 0) ? (
        <div className="card p-16 text-center">
          <Brain size={40} className="text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">No hay sesiones con resumen IA aún.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.history.map((session: any) => (
            <SessionCard key={session.appointment_id} session={session} router={router} />
          ))}
        </div>
      )}
    </div>
  )
}
