'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiApi, appointmentsApi } from '@/lib/api'
import {
  Upload, Mic, FileText, Brain, Dumbbell,
  CheckCircle, Clock, AlertCircle, ChevronRight, Loader2, ArrowLeft
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'transcript' | 'soap' | 'exercises' | 'done'

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: 'upload',     label: 'Audio',        icon: Mic },
  { id: 'transcript', label: 'Transcripción', icon: FileText },
  { id: 'soap',       label: 'SOAP',          icon: Brain },
  { id: 'exercises',  label: 'Ejercicios',    icon: Dumbbell },
]

// ── Componente ─────────────────────────────────────────────────────────────────
export default function SessionPage() {
  const { id: appointmentId } = useParams() as { id: string }
  const router = useRouter()
  const qc = useQueryClient()

  const [step, setStep]           = useState<Step>('upload')
  const [dragging, setDragging]   = useState(false)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [polling, setPolling]     = useState(false)
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Datos de cita
  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

  // Transcripción (se refresca por polling)
  const { data: transcript, refetch: refetchTranscript } = useQuery({
    queryKey: ['transcript', appointmentId],
    queryFn: () => aiApi.getTranscript(appointmentId).then(r => r.data).catch(() => null),
    enabled: step === 'transcript',
  })

  // Resumen SOAP
  const { data: summary } = useQuery({
    queryKey: ['summary', appointmentId],
    queryFn: () => aiApi.getSummary(appointmentId).then(r => r.data).catch(() => null),
    enabled: step === 'soap' || step === 'exercises' || step === 'done',
  })

  // Plan de ejercicios
  const { data: exercisePlan } = useQuery({
    queryKey: ['exercise-plan', appointmentId],
    queryFn: () => aiApi.getExercisePlan(appointmentId).then(r => r.data).catch(() => null),
    enabled: step === 'exercises' || step === 'done',
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const uploadAudio = useMutation({
    mutationFn: (file: File) => aiApi.uploadAudio(appointmentId, file),
    onSuccess: () => {
      setStep('transcript')
      startPolling()
    },
  })

  const generateSoap = useMutation({
    mutationFn: () => aiApi.generateSoap(appointmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['summary', appointmentId] })
      setStep('exercises')
    },
  })

  const generateExercises = useMutation({
    mutationFn: () => aiApi.generateExercisePlan(appointmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercise-plan', appointmentId] })
      setStep('done')
    },
  })

  // ── Polling transcripción ──────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    setPolling(true)
    pollRef.current = setInterval(async () => {
      const { data } = await refetchTranscript()
      if (data?.status === 'completed' || data?.status === 'failed') {
        clearInterval(pollRef.current!)
        setPolling(false)
        if (data.status === 'completed') setStep('soap')
      }
    }, 3000)
  }, [refetchTranscript])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('audio/')) setAudioFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setAudioFile(file)
  }

  const currentStepIdx = STEPS.findIndex(s => s.id === step)

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

      {/* Progress steps */}
      <div className="flex items-center gap-0 mb-10">
        {STEPS.map((s, i) => {
          const done    = i < currentStepIdx || step === 'done'
          const current = s.id === step
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
                <div className={`flex-1 h-0.5 mb-5 mx-1 transition-all ${i < currentStepIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Paso 1: Upload audio ─────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Sube el audio de la sesión</h2>
          <p className="text-sm text-gray-500 mb-6">
            El audio se transcribe localmente con Whisper — nunca sale del servidor.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragging ? 'border-brand-400 bg-brand-50' :
              audioFile ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
            {audioFile ? (
              <>
                <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
                <p className="font-medium text-green-700">{audioFile.name}</p>
                <p className="text-sm text-green-600 mt-1">
                  {(audioFile.size / 1024 / 1024).toFixed(1)} MB · Listo para subir
                </p>
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

          <button
            onClick={() => audioFile && uploadAudio.mutate(audioFile)}
            disabled={!audioFile || uploadAudio.isPending}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            {uploadAudio.isPending ? (
              <><Loader2 size={16} className="animate-spin" /> Subiendo...</>
            ) : (
              <><Upload size={16} /> Subir y transcribir</>
            )}
          </button>
        </div>
      )}

      {/* ── Paso 2: Transcripción ────────────────────────────────────────────── */}
      {step === 'transcript' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Transcribiendo sesión</h2>
          <p className="text-sm text-gray-500 mb-6">Whisper está procesando el audio localmente.</p>

          {(!transcript || transcript.status === 'pending' || transcript.status === 'processing') && (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin" />
                <Mic size={20} className="absolute inset-0 m-auto text-brand-600" />
              </div>
              <p className="text-sm text-gray-500 animate-pulse">
                {transcript?.status === 'processing' ? 'Transcribiendo...' : 'Iniciando Whisper...'}
              </p>
            </div>
          )}

          {transcript?.status === 'completed' && (
            <>
              <div className="flex items-center gap-2 text-green-600 mb-4">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">
                  Transcripción completada · {Math.round((transcript.duration_seconds || 0) / 60)} min
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto text-sm text-gray-700 leading-relaxed mb-6">
                {transcript.transcript_text}
              </div>
              <button onClick={() => setStep('soap')} className="btn-primary w-full flex items-center justify-center gap-2">
                Generar resumen SOAP <ChevronRight size={16} />
              </button>
            </>
          )}

          {transcript?.status === 'failed' && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-4">
              <AlertCircle size={16} />
              <div>
                <p className="font-medium text-sm">Error en transcripción</p>
                <p className="text-xs mt-0.5">{transcript.error_message}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 3: SOAP ────────────────────────────────────────────────────── */}
      {step === 'soap' && (
        <div className="card p-8">
          <h2 className="text-lg font-medium text-gray-900 mb-1">Resumen SOAP</h2>
          <p className="text-sm text-gray-500 mb-6">
            El LLM generará el resumen usando la transcripción y el historial previo del paciente (RAG).
          </p>

          {!summary && (
            <button
              onClick={() => generateSoap.mutate()}
              disabled={generateSoap.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {generateSoap.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Generando con {generateSoap.isPending ? 'LLM' : ''}...</>
              ) : (
                <><Brain size={16} /> Generar resumen SOAP</>
              )}
            </button>
          )}

          {summary && (
            <>
              <div className="space-y-4 mb-6">
                {[
                  { key: 'subjective', label: 'S — Subjetivo', color: 'blue' },
                  { key: 'objective',  label: 'O — Objetivo',  color: 'purple' },
                  { key: 'assessment', label: 'A — Evaluación', color: 'amber' },
                  { key: 'plan',       label: 'P — Plan',      color: 'green' },
                ].map(({ key, label, color }) => (
                  <div key={key} className={`rounded-xl p-4 bg-${color}-50 border border-${color}-100`}>
                    <p className={`text-xs font-semibold text-${color}-600 mb-1`}>{label}</p>
                    <p className="text-sm text-gray-700">{(summary as any)[key] || '—'}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
                <span>Generado con</span>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">
                  {summary.llm_provider === 'ollama' ? 'Ollama (local)' : 'Claude API'}
                </span>
              </div>
              <button
                onClick={() => generateExercises.mutate()}
                disabled={generateExercises.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {generateExercises.isPending ? (
                  <><Loader2 size={16} className="animate-spin" /> Generando ejercicios...</>
                ) : (
                  <><Dumbbell size={16} /> Generar plan de ejercicios</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Paso 4: Ejercicios ───────────────────────────────────────────────── */}
      {(step === 'exercises' || step === 'done') && exercisePlan && (
        <div className="card p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Plan de ejercicios</h2>
              <p className="text-sm text-gray-500 mt-0.5">{exercisePlan.frequency}</p>
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-mono">
              {exercisePlan.llm_provider === 'ollama' ? 'Ollama (local)' : 'Claude API'}
            </span>
          </div>

          <div className="space-y-4 mb-6">
            {(exercisePlan.exercises as any[]).map((ex: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-medium text-sm text-gray-900">{ex.title}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <Clock size={12} />
                    {ex.duration_min} min
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{ex.description}</p>
                <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                  {ex.frequency}
                </span>
              </div>
            ))}
          </div>

          {exercisePlan.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
              <p className="text-xs font-semibold text-amber-700 mb-1">Notas</p>
              <p className="text-sm text-amber-800">{exercisePlan.notes}</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl p-4">
              <CheckCircle size={16} />
              <p className="text-sm font-medium">Sesión completada. El plan está disponible para el paciente.</p>
            </div>
          )}

          {step === 'exercises' && (
            <button onClick={() => setStep('done')} className="btn-primary w-full mt-2">
              Finalizar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
