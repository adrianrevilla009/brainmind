'use client'
import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, videoApi, aiApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import {
  Mic, Square, CheckCircle, ArrowLeft,
  Loader2, Brain, ExternalLink, Video,
  Upload, SkipForward, Clock, AlertCircle, ShieldAlert
} from 'lucide-react'

type Step = 'pre' | 'in-session' | 'uploading' | 'done'
type RecState = 'idle' | 'recording' | 'stopped'

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

export default function VideoPage() {
  const { id: appointmentId } = useParams() as { id: string }
  const router = useRouter()
  const qc     = useQueryClient()
  const role   = useAuthStore(s => s.role)

  const [step, setStep]           = useState<Step>('pre')
  const [recState, setRecState]   = useState<RecState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recSeconds, setRecSeconds] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const mediaRef  = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn:  () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

  useEffect(() => {
    if (appt?.status === 'completed') setStep('done')
  }, [appt])

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (progressRef.current) clearInterval(progressRef.current)
  }, [])

  const complete = useMutation({
    mutationFn: () => videoApi.complete(appointmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['appointment', appointmentId] })
    },
  })

  const uploadAudio = useMutation({
    mutationFn: (blob: Blob) => {
      const file = new File([blob], `session-${appointmentId}.webm`, { type: 'audio/webm' })
      return aiApi.uploadAudio(appointmentId, file)
    },
    onSuccess: () => {
      if (progressRef.current) clearInterval(progressRef.current)
      setUploadProgress(100)
      setTimeout(() => router.push(`/dashboard/session/${appointmentId}?from=upload`), 800)
    },
    onError: (err: any) => {
      if (progressRef.current) clearInterval(progressRef.current)
      const detail = err?.response?.data?.detail || 'Error al subir el audio'
      setUploadError(detail)
      setStep('in-session')   // volver al paso de grabación para que vea el error
    },
  })

  const startRecording = async () => {
    setUploadError(null)  // limpiar error previo al reintentar
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: 'audio/webm' }))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start(1000)
      mediaRef.current = mr
      setRecState('recording')
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      alert('No se pudo acceder al micrófono. Comprueba los permisos del navegador.')
    }
  }

  const stopRecording = () => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setRecState('stopped')
  }

  const handleFinish = async (skipAudio = false) => {
    setStep('uploading')
    // Finalizar cita
    await complete.mutateAsync()

    if (!skipAudio && audioBlob) {
      // Simular progreso mientras sube
      setUploadProgress(5)
      progressRef.current = setInterval(() => {
        setUploadProgress(p => Math.min(p + 3, 90))
      }, 400)
      uploadAudio.mutate(audioBlob)
    } else {
      router.push(`/dashboard/session/${appointmentId}`)
    }
  }

  const jitsiUrl   = appt?.video_room_url
  const isCompleted = appt?.status === 'completed'

  // ── PANTALLA: Paciente ──────────────────────────────────────────────────────
  if (role === 'patient') {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-8 text-sm">
          <ArrowLeft size={16} /> Volver
        </button>
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-5">
            <Video size={28} className="text-brand-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Tu sesión</h1>
          {appt && (
            <p className="text-gray-500 text-sm mb-6">
              {new Date(appt.scheduled_at).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long',
              })} · {new Date(appt.scheduled_at).toLocaleTimeString('es-ES', {
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
          {isCompleted ? (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
              <CheckCircle size={20} className="text-green-500 mx-auto mb-2" />
              <p className="text-green-800 font-medium text-sm">Sesión completada</p>
              <p className="text-green-600 text-xs mt-1">Tu psicólogo preparará el plan de ejercicios en breve.</p>
            </div>
          ) : (
            <button onClick={() => window.open(jitsiUrl!, '_blank', 'noopener,noreferrer')}
              disabled={!jitsiUrl}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base">
              <ExternalLink size={18} /> Entrar a la sesión
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── PANTALLA: Psicólogo — Paso 1: Pre-sesión ────────────────────────────────
  if (step === 'pre') {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-8 text-sm">
          <ArrowLeft size={16} /> Volver
        </button>

        {appt && (
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              {new Date(appt.scheduled_at).toLocaleDateString('es-ES', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </h1>
            <p className="text-gray-500 mt-1">
              {new Date(appt.scheduled_at).toLocaleTimeString('es-ES', {
                hour: '2-digit', minute: '2-digit',
              })} · {appt.duration_min} min
            </p>
          </div>
        )}

        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-5">
            <Video size={28} className="text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">¿Listo para la sesión?</h2>
          <p className="text-gray-500 text-sm mb-8">
            La videollamada se abrirá en una nueva pestaña. Cuando termines, vuelve aquí para grabar el resumen.
          </p>
          <button
            onClick={() => {
              window.open(jitsiUrl!, '_blank', 'noopener,noreferrer')
              setStep('in-session')
            }}
            disabled={!jitsiUrl}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base mb-3">
            <ExternalLink size={18} /> Abrir videollamada
          </button>
          <button onClick={() => setStep('in-session')}
            className="text-sm text-gray-400 hover:text-gray-600">
            Ya la tengo abierta → continuar
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA: Psicólogo — Paso 2: En sesión ─────────────────────────────────
  if (step === 'in-session') {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-8 text-sm">
          <ArrowLeft size={16} /> Volver
        </button>

        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Sesión en curso
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Grabar audio de la sesión</h1>
          <p className="text-gray-500 text-sm mt-1">
            El audio se transcribe localmente — nunca sale del servidor
          </p>
        </div>

        {/* Grabador */}
        <div className="card p-8 mb-4">
          {recState === 'idle' && (
            <div className="text-center">
              <button onClick={startRecording}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center mx-auto mb-4 transition-all shadow-lg hover:shadow-xl hover:scale-105">
                <Mic size={32} />
              </button>
              <p className="text-gray-700 font-medium">Pulsa para grabar</p>
              <p className="text-gray-400 text-sm mt-1">El audio se captura desde tu micrófono</p>
            </div>
          )}

          {recState === 'recording' && (
            <div className="text-center">
              <button onClick={stopRecording}
                className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center mx-auto mb-4 transition-all shadow-lg animate-pulse">
                <Square size={28} />
              </button>
              <p className="text-2xl font-mono text-red-500 font-semibold mb-1">{fmt(recSeconds)}</p>
              <p className="text-gray-500 text-sm">Grabando... pulsa para detener</p>
            </div>
          )}

          {recState === 'stopped' && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={36} className="text-green-500" />
              </div>
              <p className="text-gray-900 font-semibold mb-1">Audio grabado</p>
              <p className="text-gray-500 text-sm mb-1">{fmt(recSeconds)} de grabación</p>
              <button onClick={() => { setRecState('idle'); setAudioBlob(null); setRecSeconds(0) }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                Descartar y volver a grabar
              </button>
            </div>
          )}
        </div>

        {/* Error de consentimiento u otro error de subida */}
        {uploadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-2">
            <ShieldAlert size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-700">No se pudo subir el audio</p>
              <p className="text-sm text-red-600 mt-0.5">{uploadError}</p>
              {uploadError.toLowerCase().includes('consentimiento') && (
                <p className="text-xs text-red-500 mt-2">
                  El paciente debe firmar el consentimiento de transcripción en su perfil antes de poder grabar la sesión.
                </p>
              )}
              <button
                onClick={() => setUploadError(null)}
                className="text-xs text-red-600 underline mt-2 font-semibold"
              >
                Continuar sin audio →
              </button>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="space-y-3">
          {recState === 'stopped' && audioBlob ? (
            <button
              onClick={() => handleFinish(false)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-brand-600 text-white text-base font-semibold hover:bg-brand-700 transition-colors">
              <Upload size={18} /> Finalizar y subir audio
            </button>
          ) : (
            <button
              disabled={recState === 'recording'}
              onClick={() => handleFinish(false)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-brand-600 text-white text-base font-semibold hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle size={18} /> Finalizar sesión
            </button>
          )}

          <button
            disabled={recState === 'recording'}
            onClick={() => handleFinish(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40">
            <SkipForward size={16} /> Finalizar sin audio
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Sin audio también puedes generar el resumen SOAP manualmente
        </p>
      </div>
    )
  }

  // ── PANTALLA: Subiendo / procesando ──────────────────────────────────────────
  if (step === 'uploading') {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-brand-100 border-t-brand-600 animate-spin mx-auto mb-6" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {uploadProgress < 100 ? 'Subiendo audio...' : '¡Listo!'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {uploadProgress < 100
              ? 'Whisper transcribirá el audio automáticamente en segundo plano'
              : 'Redirigiendo al resumen de sesión...'}
          </p>
          {audioBlob && (
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-500 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          {!audioBlob && (
            <p className="text-sm text-gray-400">Sesión finalizada, redirigiendo...</p>
          )}
        </div>
      </div>
    )
  }

  // ── PANTALLA: Completada ──────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto pt-8">
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Sesión completada</h2>
        <p className="text-gray-500 text-sm mb-8">
          Ya puedes generar el resumen clínico y el plan de ejercicios con IA.
        </p>
        <button
          onClick={() => router.push(`/dashboard/session/${appointmentId}`)}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base">
          <Brain size={18} /> Ir al resumen IA
        </button>
        <button onClick={() => router.push('/dashboard/appointments')}
          className="mt-3 text-sm text-gray-400 hover:text-gray-600 block w-full">
          Volver a mis citas
        </button>
      </div>
    </div>
  )
}