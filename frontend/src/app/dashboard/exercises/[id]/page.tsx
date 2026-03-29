'use client'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi, appointmentsApi } from '@/lib/api'
import { CheckCircle, Clock, Dumbbell, ArrowLeft, Sparkles } from 'lucide-react'

export default function ExercisesPage() {
  const { id: appointmentId } = useParams() as { id: string }
  const router = useRouter()
  const qc = useQueryClient()

  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

  const { data: plan, isLoading } = useQuery({
    queryKey: ['exercise-plan', appointmentId],
    queryFn: () => aiApi.getExercisePlan(appointmentId).then(r => r.data).catch(() => null),
  })

  const acknowledge = useMutation({
    mutationFn: () => aiApi.acknowledgeExercisePlan(plan!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercise-plan', appointmentId] }),
  })

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <Dumbbell size={48} className="text-gray-200 mx-auto mb-4" />
        <p className="text-gray-500">Tu psicólogo aún no ha generado un plan de ejercicios para esta sesión.</p>
        <button onClick={() => router.back()} className="mt-6 text-sm text-brand-600 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Tu plan de ejercicios
          </h1>
          {appt && (
            <p className="text-sm text-gray-500 mt-0.5">
              Sesión del {new Date(appt.scheduled_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long'
              })}
            </p>
          )}
        </div>
      </div>

      {/* Frecuencia general */}
      <div className="flex items-center gap-3 bg-brand-50 border border-brand-100 rounded-xl px-5 py-4 mb-6">
        <Sparkles size={20} className="text-brand-600 shrink-0" />
        <div>
          <p className="text-xs text-brand-500 font-medium">Frecuencia recomendada</p>
          <p className="text-sm font-semibold text-brand-800 mt-0.5">{plan.frequency}</p>
        </div>
      </div>

      {/* Lista de ejercicios */}
      <div className="space-y-4 mb-8">
        {(plan.exercises as any[]).map((ex: any, i: number) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {i + 1}
                </div>
                <h3 className="font-medium text-gray-900">{ex.title}</h3>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0 mt-1">
                <Clock size={12} />
                <span>{ex.duration_min} min</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-3 ml-11">{ex.description}</p>
            <div className="ml-11">
              <span className="inline-block text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1 rounded-full">
                {ex.frequency}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Notas del psicólogo */}
      {plan.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-8">
          <p className="text-xs font-semibold text-amber-600 mb-1.5">Nota de tu psicólogo</p>
          <p className="text-sm text-amber-900 leading-relaxed">{plan.notes}</p>
        </div>
      )}

      {/* Acknowledge */}
      {plan.is_acknowledged ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-100 rounded-xl p-4">
          <CheckCircle size={16} />
          <p className="text-sm font-medium">Plan confirmado el {
            new Date(plan.acknowledged_at).toLocaleDateString('es-ES', {
              day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            })
          }</p>
        </div>
      ) : (
        <button
          onClick={() => acknowledge.mutate()}
          disabled={acknowledge.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <CheckCircle size={16} />
          {acknowledge.isPending ? 'Confirmando...' : 'He leído mi plan de ejercicios'}
        </button>
      )}
    </div>
  )
}