'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { aiApi, appointmentsApi } from '@/lib/api'
import {
  FileText, Brain, Dumbbell, CheckCircle,
  AlertCircle, Loader2, ArrowLeft, Clock, Mic, ChevronRight
} from 'lucide-react'

// Pasos visibles en el stepper
type Step = 'transcribing' | 'ready_soap' | 'generating_soap' | 'ready_exercises' | 'generating_exercises' | 'done'

function SessionContent() {
  const { id: appointmentId } = useParams() as { id: string }
  const searchParams = useSearchParams()
  const router = useRouter()
  const fromUpload = searchParams.get('from') === 'upload'

  const [step, setStep] = useState<Step>('transcribing')
  const [ready, setReady] = useState(false)          // hidratación completada
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [exercisePlan, setExercisePlan] = useState<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

  // ── Polling: espera que Whisper termine ──────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await aiApi.getTranscript(appointmentId)
        const data = res.data
        if (data?.status === 'completed') {
          clearInterval(pollRef.current!); pollRef.current = null
          setTranscript(data)
          setStep('ready_soap')   // transcripción lista → mostrar botón SOAP
        } else if (data?.status === 'failed') {
          clearInterval(pollRef.current!); pollRef.current = null
          setError(data.error_message || 'Error en la transcripción')
          setStep('ready_soap')   // mostrar error pero no bloquear
        }
      } catch { /* seguir esperando */ }
    }, 3000)
  }, [appointmentId])

  // ── Generar SOAP (manual, botón) → luego lanza ejercicios automáticamente
  const handleGenerateSoap = async () => {
    setStep('generating_soap')
    setError(null)
    try {
      const soapRes = await aiApi.generateSoap(appointmentId)
      setSummary(soapRes.data)
      // SOAP listo → lanzar ejercicios automáticamente
      setStep('generating_exercises')
      const exRes = await aiApi.generateExercisePlan(appointmentId)
      setExercisePlan(exRes.data)
      setStep('done')
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error generando contenido IA')
      setStep('ready_soap')   // volver al botón para reintentar
    }
  }

  // ── Hidratación al montar ────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Si viene de /video con audio recién subido → transcribiendo
      if (fromUpload) {
        setStep('transcribing')
        setReady(true)
        startPolling()
        return
      }

      // Detectar estado real de la sesión
      try {
        // ¿Ya tiene ejercicios? → done
        const exRes = await aiApi.getExercisePlan(appointmentId).then(r => r.data).catch(() => null)
        if (exRes?.exercises?.length) {
          const [sumRes, trRes] = await Promise.all([
            aiApi.getSummary(appointmentId).then(r => r.data).catch(() => null),
            aiApi.getTranscript(appointmentId).then(r => r.data).catch(() => null),
          ])
          if (sumRes) setSummary(sumRes)
          if (trRes?.status === 'completed') setTranscript(trRes)
          setExercisePlan(exRes)
          setStep('done')
          return
        }

        // ¿Tiene SOAP pero no ejercicios?
        const sumRes = await aiApi.getSummary(appointmentId).then(r => r.data).catch(() => null)
        if (sumRes) {
          setSummary(sumRes)
          setStep('generating_exercises')
          try {
            const exRes2 = await aiApi.generateExercisePlan(appointmentId)
            setExercisePlan(exRes2.data)
          } catch {}
          setStep('done')
          return
        }

        // ¿Tiene transcript completado?
        const trRes = await aiApi.getTranscript(appointmentId).then(r => r.data).catch(() => null)
        if (trRes?.status === 'completed') {
          setTranscript(trRes)
          setStep('ready_soap')
          return
        }
        if (trRes?.status === 'processing' || trRes?.status === 'pending') {
          setStep('transcribing')
          startPolling()
          return
        }

        // Sin datos → volver a grabar
        router.replace(`/dashboard/video/${appointmentId}`)
      } finally {
        setReady(true)
      }
    }

    init()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Stepper visual ───────────────────────────────────────────────────────
  const stepperItems = [
    { label: 'Transcripción', done: step !== 'transcribing', active: step === 'transcribing' },
    { label: 'SOAP',          done: ['generating_exercises','done'].includes(step), active: ['ready_soap','generating_soap'].includes(step) },
    { label: 'Ejercicios',    done: step === 'done', active: step === 'generating_exercises' },
  ]

  if (!ready) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
        <p className="text-sm text-clinical-400">Cargando sesión...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto anim-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="btn-ghost p-2 rounded-xl">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title">Resumen de sesión</h1>
          {appt && (
            <p className="page-subtitle">
              {new Date(appt.scheduled_at).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-start mb-10">
        {stepperItems.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                s.done    ? 'bg-emerald-500 text-white shadow-sm' :
                s.active  ? 'bg-brand-600 text-white ring-4 ring-brand-100 shadow-clinical' :
                            'bg-clinical-100 text-clinical-400'
              }`}>
                {s.done
                  ? <CheckCircle size={17} />
                  : s.active && ['transcribing','generating_soap','generating_exercises'].includes(step)
                    ? <Loader2 size={17} className="animate-spin" />
                    : i === 0 ? <Mic size={17} /> : i === 1 ? <Brain size={17} /> : <Dumbbell size={17} />
                }
              </div>
              <span className={`text-xs font-semibold ${
                s.active ? 'text-brand-600' : s.done ? 'text-emerald-600' : 'text-clinical-400'
              }`}>{s.label}</span>
            </div>
            {i < stepperItems.length - 1 && (
              <div className={`flex-1 h-0.5 mb-5 mx-1.5 transition-colors duration-500 ${
                s.done ? 'bg-emerald-400' : 'bg-clinical-200'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Paso 1: Transcribiendo (spinner automático) ───────────────────── */}
      {step === 'transcribing' && (
        <div className="card p-12 text-center anim-scale-in">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Mic size={24} className="text-brand-600" />
            </div>
          </div>
          <h2 className="font-bold text-clinical-900 text-lg mb-2">Transcribiendo sesión...</h2>
          <p className="text-sm text-clinical-400 mb-1">Whisper está procesando el audio localmente</p>
          <p className="text-xs text-clinical-300">Cuando termine, podrás generar el resumen SOAP</p>
          <div className="flex justify-center gap-1.5 mt-6">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Paso 2a: Transcripción lista → botón SOAP ─────────────────────── */}
      {step === 'ready_soap' && (
        <div className="space-y-5 anim-scale-in">
          {/* Transcripción preview */}
          {transcript?.transcript_text && (
            <div className="card p-5">
              <p className="section-label mb-3">Transcripción completada</p>
              <div className="bg-clinical-50 rounded-xl p-4 max-h-48 overflow-y-auto text-sm text-clinical-700 leading-relaxed">
                {transcript.transcript_text}
              </div>
            </div>
          )}
          {/* CTA */}
          <button onClick={handleGenerateSoap} className="btn-primary w-full btn-lg">
            <Brain size={18} />
            Generar resumen SOAP
            <ChevronRight size={16} className="ml-auto" />
          </button>
          <p className="text-xs text-center text-clinical-400">
            El SOAP se genera con IA. Después se crearán los ejercicios automáticamente.
          </p>
        </div>
      )}

      {/* ── Paso 2b: Generando SOAP ───────────────────────────────────────── */}
      {step === 'generating_soap' && (
        <div className="space-y-5 anim-scale-in">
          <div className="card p-5 flex items-center gap-3 bg-brand-50 border border-brand-200">
            <Loader2 size={18} className="text-brand-600 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-brand-800">Generando resumen SOAP...</p>
              <p className="text-xs text-brand-500 mt-0.5">La IA está analizando la sesión</p>
            </div>
          </div>
          {transcript?.transcript_text && (
            <div className="card p-5">
              <p className="section-label mb-3">Transcripción</p>
              <div className="bg-clinical-50 rounded-xl p-4 max-h-40 overflow-y-auto text-sm text-clinical-700 leading-relaxed">
                {transcript.transcript_text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 3: SOAP listo, generando ejercicios automáticamente ─────── */}
      {step === 'generating_exercises' && (
        <div className="space-y-5 anim-scale-in">
          <div className="card p-5 flex items-center gap-3 bg-emerald-50 border border-emerald-200">
            <Loader2 size={18} className="text-emerald-600 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">SOAP generado · Creando plan de ejercicios...</p>
              <p className="text-xs text-emerald-600 mt-0.5">Generación automática en curso</p>
            </div>
          </div>
          {summary && <SoapCards summary={summary} />}
        </div>
      )}

      {/* ── Paso 4: Todo listo ───────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="space-y-6 anim-slide-up">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-bold text-emerald-700">
              Sesión procesada — SOAP y ejercicios listos
            </p>
          </div>

          {/* Transcripción */}
          {transcript?.transcript_text && (
            <div className="card p-5">
              <p className="section-label mb-3">Transcripción</p>
              <div className="bg-clinical-50 rounded-xl p-4 max-h-40 overflow-y-auto text-sm text-clinical-700 leading-relaxed">
                {transcript.transcript_text}
              </div>
            </div>
          )}

          {/* SOAP */}
          {summary && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-clinical-900">Resumen SOAP</p>
                <span className="badge-gray text-xs">
                  {summary.llm_provider === 'ollama' ? 'Ollama local' : 'Claude API'}
                </span>
              </div>
              <SoapCards summary={summary} />
            </div>
          )}

          {/* Ejercicios */}
          {exercisePlan && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-clinical-900">Plan de ejercicios</p>
                <span className="badge-gray text-xs">
                  {exercisePlan.llm_provider === 'ollama' ? 'Ollama local' : 'Claude API'}
                </span>
              </div>
              {exercisePlan.frequency && (
                <p className="text-sm text-clinical-400 mb-4">{exercisePlan.frequency}</p>
              )}
              <div className="space-y-3 mb-5 stagger">
                {(exercisePlan.exercises as any[]).map((ex: any, i: number) => (
                  <div key={i} className="border border-clinical-100 rounded-xl p-4 hover:bg-clinical-50 transition-colors anim-slide-up">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="font-semibold text-sm text-clinical-900">{ex.title}</p>
                      <div className="flex items-center gap-1 text-xs text-clinical-400 flex-shrink-0">
                        <Clock size={11} /> {ex.duration_min} min
                      </div>
                    </div>
                    <p className="text-sm text-clinical-600 mb-2">{ex.description}</p>
                    <span className="badge-blue text-xs">{ex.frequency}</span>
                  </div>
                ))}
              </div>
              {exercisePlan.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Notas clínicas</p>
                  <p className="text-sm text-amber-800">{exercisePlan.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SoapCards({ summary }: { summary: any }) {
  const sections = [
    { key: 'subjective', label: 'S — Subjetivo',  bg: 'bg-brand-50',   border: 'border-brand-100',   text: 'text-brand-700'   },
    { key: 'objective',  label: 'O — Objetivo',   bg: 'bg-purple-50',  border: 'border-purple-100',  text: 'text-purple-700'  },
    { key: 'assessment', label: 'A — Evaluación', bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700'   },
    { key: 'plan',       label: 'P — Plan',       bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700' },
  ]
  return (
    <div className="space-y-3">
      {sections.map(({ key, label, bg, border, text }) => (
        <div key={key} className={`rounded-xl p-4 ${bg} border ${border}`}>
          <p className={`text-xs font-bold mb-1.5 uppercase tracking-wide ${text}`}>{label}</p>
          <p className="text-sm text-clinical-800 leading-relaxed">{(summary as any)[key] || '—'}</p>
        </div>
      ))}
    </div>
  )
}

export default function SessionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-64">
        <div className="w-10 h-10 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
      </div>
    }>
      <SessionContent />
    </Suspense>
  )
}