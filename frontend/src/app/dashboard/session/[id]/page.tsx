'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { aiApi, appointmentsApi } from '@/lib/api'
import {
  Upload, Mic, FileText, Brain, Dumbbell,
  CheckCircle, AlertCircle, Loader2, ArrowLeft, Clock
} from 'lucide-react'

type Step = 'upload' | 'transcript' | 'soap' | 'generating' | 'done'

const STEPS = [
  { id: 'upload',     label: 'Audio',        icon: Mic      },
  { id: 'transcript', label: 'Transcripción', icon: FileText },
  { id: 'soap',       label: 'SOAP',          icon: Brain    },
  { id: 'done',       label: 'Ejercicios',    icon: Dumbbell },
]

export default function SessionPage() {
  const { id: appointmentId } = useParams() as { id: string }
  const router = useRouter()

  const fromUpload = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('from') === 'upload'

  const [step, setStep]             = useState<Step>(fromUpload ? 'transcript' : 'upload')
  const [hydrated, setHydrated]     = useState(fromUpload)
  const [dragging, setDragging]     = useState(false)
  const [audioFile, setAudioFile]   = useState<File | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [generatingSoap, setGeneratingSoap] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState('')
  const [error, setError]           = useState<string | null>(null)

  // Datos acumulados en cadena — nunca se fetchen solos
  const [transcript, setTranscript]     = useState<any>(null)
  const [summary, setSummary]           = useState<any>(null)
  const [exercisePlan, setExercisePlan] = useState<any>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

  // ── Polling transcripción ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await aiApi.getTranscript(appointmentId)
        const data = res.data
        if (data?.status === 'completed') {
          clearInterval(pollRef.current!); pollRef.current = null
          setTranscript(data)
          setStep('soap')
        } else if (data?.status === 'failed') {
          clearInterval(pollRef.current!); pollRef.current = null
          setError(data.error_message || 'Error en transcripción')
          setStep('upload')
        }
      } catch { /* sigue esperando */ }
    }, 3000)
  }, [appointmentId])

  useEffect(() => {
    if (fromUpload) startPolling()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Hidratación: leer estado real una sola vez ─────────────────────────────
  useEffect(() => {
    if (hydrated || fromUpload) return
    const detect = async () => {
      try {
        // De más completo a menos: ejercicios → summary → transcript
        const exRes = await aiApi.getExercisePlan(appointmentId).then(r => r.data).catch(() => null)
        if (exRes) {
          const sumRes = await aiApi.getSummary(appointmentId).then(r => r.data).catch(() => null)
          setSummary(sumRes)
          setExercisePlan(exRes)
          setStep('done')
          return
        }
        const sumRes = await aiApi.getSummary(appointmentId).then(r => r.data).catch(() => null)
        if (sumRes) {
          setSummary(sumRes)
          setStep('soap')
          return
        }
        const trRes = await aiApi.getTranscript(appointmentId).then(r => r.data).catch(() => null)
        if (trRes?.status === 'completed') {
          setTranscript(trRes); setStep('soap')
        } else if (trRes?.status === 'processing' || trRes?.status === 'pending') {
          setTranscript(trRes); setStep('transcript'); startPolling()
        }
      } finally {
        setHydrated(true)
      }
    }
    detect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Upload audio ───────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!audioFile) return
    setUploading(true); setError(null)
    try {
      await aiApi.uploadAudio(appointmentId, audioFile)
      setStep('transcript')
      startPolling()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error al subir el audio')
    } finally { setUploading(false) }
  }

  // ── SOAP → Ejercicios en cadena (todo con await, sin queries reactivas) ────
  const handleGenerateSoap = async () => {
    setGeneratingSoap(true); setError(null)
    try {
      setGeneratingLabel('Generando resumen SOAP...')
      const soapRes = await aiApi.generateSoap(appointmentId)
      setSummary(soapRes.data)
      setStep('generating')

      setGeneratingLabel('Generando plan de ejercicios...')
      const exRes = await aiApi.generateExercisePlan(appointmentId)
      setExercisePlan(exRes.data)
      setStep('done')
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error generando contenido')
      setStep('soap')
    } finally { setGeneratingSoap(false) }
  }

  const currentStepIdx = STEPS.findIndex(s =>
    s.id === (step === 'generating' ? 'done' : step)
  )

  if (!hydrated) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center min-h-64 gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
        <p className="text-sm text-gray-400">Cargando estado de la sesión...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Resumen de sesión
          </h1>
          {appt && (
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date(appt.scheduled_at).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long'
              })}
            </p>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-0 mb-10">
        {STEPS.map((s, i) => {
          const done    = i < currentStepIdx || step === 'done'
          const current = s.id === (step === 'generating' ? 'done' : step)
          const Icon    = s.icon
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  done    ? 'bg-green-500 text-white' :
                  current ? 'bg-brand-600 text-white ring-4 ring-brand-100' :
                            'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <CheckCircle size={16} /> : <Icon size={16} />}
                </div>
                <span className={`text-xs font-medium ${current ? 'text-brand-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mb-5 mx-1 ${i < currentStepIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-4 mb-6">
          <AlertCircle size={16} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Sube el audio de la sesión</h2>
          <p className="text-sm text-gray-500 mb-6">El audio se transcribe localmente con Whisper — nunca sale del servidor.</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('audio/')) setAudioFile(f) }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragging ? 'border-brand-400 bg-brand-50' :
              audioFile ? 'border-green-300 bg-green-50' :
              'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setAudioFile(f) }} />
            {audioFile ? (
              <>
                <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
                <p className="font-medium text-green-700">{audioFile.name}</p>
                <p className="text-sm text-green-600 mt-1">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </>
            ) : (
              <>
                <Upload size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-600">Arrastra el audio aquí</p>
                <p className="text-sm text-gray-400 mt-1">o haz clic para seleccionar</p>
                <p className="text-xs text-gray-300 mt-3">MP3, WAV, OGG, WebM · hasta 500 MB</p>
              </>
            )}
          </div>
          <button onClick={handleUpload} disabled={!audioFile || uploading}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2">
            {uploading ? <><Loader2 size={16} className="animate-spin" /> Subiendo...</> : <><Upload size={16} /> Subir y transcribir</>}
          </button>
        </div>
      )}

      {/* ── Transcripción ─────────────────────────────────────────────────── */}
      {step === 'transcript' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Transcribiendo sesión</h2>
          <p className="text-sm text-gray-500 mb-6">Whisper está procesando el audio localmente.</p>
          <div className="flex flex-col items-center py-12 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
              <Mic size={20} className="absolute inset-0 m-auto text-brand-600" />
            </div>
            <p className="text-sm text-gray-500 animate-pulse">Transcribiendo audio...</p>
          </div>
        </div>
      )}

      {/* ── SOAP (único botón manual) ──────────────────────────────────────── */}
      {step === 'soap' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Resumen SOAP</h2>
          <p className="text-sm text-gray-500 mb-6">
            Pulsa para generar el resumen clínico y el plan de ejercicios automáticamente.
          </p>
          {transcript?.transcript_text && (
            <div className="bg-gray-50 rounded-xl p-4 max-h-48 overflow-y-auto text-sm text-gray-600 leading-relaxed mb-6">
              {transcript.transcript_text}
            </div>
          )}
          {summary && <SoapCards summary={summary} />}
          {!exercisePlan && (
            <button onClick={handleGenerateSoap} disabled={generatingSoap}
              className="btn-primary w-full mt-4 flex items-center justify-center gap-2">
              {generatingSoap
                ? <><Loader2 size={16} className="animate-spin" /> {generatingLabel || 'Generando...'}</>
                : <><Brain size={16} /> {summary ? 'Generar ejercicios' : 'Generar SOAP + Ejercicios'}</>}
            </button>
          )}
        </div>
      )}

      {/* ── Generando en cadena ───────────────────────────────────────────── */}
      {step === 'generating' && (
        <div className="card p-8">
          {summary && (
            <>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Resumen SOAP</h2>
              <SoapCards summary={summary} />
            </>
          )}
          <div className="flex items-center gap-3 mt-6 text-sm text-brand-600 bg-brand-50 rounded-xl px-4 py-3">
            <Loader2 size={16} className="animate-spin shrink-0" />
            {generatingLabel}
          </div>
        </div>
      )}

      {/* ── Done: SOAP + Ejercicios ───────────────────────────────────────── */}
      {step === 'done' && (
        <div className="space-y-6">
          {summary && (
            <div className="card p-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Resumen SOAP</h2>
              <SoapCards summary={summary} />
              <p className="text-xs text-gray-400 mt-4">
                Generado con <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                  {summary.llm_provider === 'ollama' ? 'Ollama (local)' : 'Claude API'}
                </span>
              </p>
            </div>
          )}
          {exercisePlan && (
            <div className="card p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Plan de ejercicios</h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-mono">
                  {exercisePlan.llm_provider === 'ollama' ? 'Ollama (local)' : 'Claude API'}
                </span>
              </div>
              {exercisePlan.frequency && <p className="text-sm text-gray-500 mb-4">{exercisePlan.frequency}</p>}
              <div className="space-y-4 mb-6">
                {(exercisePlan.exercises as any[]).map((ex: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-sm text-gray-900">{ex.title}</p>
                      <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                        <Clock size={12} /> {ex.duration_min} min
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{ex.description}</p>
                    <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">{ex.frequency}</span>
                  </div>
                ))}
              </div>
              {exercisePlan.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Notas</p>
                  <p className="text-sm text-amber-800">{exercisePlan.notes}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl p-4">
                <CheckCircle size={16} />
                <p className="text-sm font-medium">Sesión completada. El plan está disponible para el paciente.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SoapCards({ summary }: { summary: any }) {
  return (
    <div className="space-y-3">
      {[
        { key: 'subjective', label: 'S — Subjetivo',  color: 'blue'   },
        { key: 'objective',  label: 'O — Objetivo',   color: 'purple' },
        { key: 'assessment', label: 'A — Evaluación', color: 'amber'  },
        { key: 'plan',       label: 'P — Plan',       color: 'green'  },
      ].map(({ key, label, color }) => (
        <div key={key} className={`rounded-xl p-4 bg-${color}-50 border border-${color}-100`}>
          <p className={`text-xs font-semibold text-${color}-600 mb-1`}>{label}</p>
          <p className="text-sm text-gray-700">{(summary as any)[key] || '—'}</p>
        </div>
      ))}
    </div>
  )
}