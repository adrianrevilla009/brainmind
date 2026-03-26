'use client'
import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, videoApi, aiApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Mic, MicOff, Square, CheckCircle, Upload, ArrowLeft, Loader2, Brain } from 'lucide-react'

type RecState = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done'

export default function VideoPage() {
  const { id: appointmentId } = useParams() as { id: string }
  const router = useRouter()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.role)

  const [recState, setRecState] = useState<RecState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recSeconds, setRecSeconds] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: appt } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => appointmentsApi.getAppointment(appointmentId).then(r => r.data),
  })

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
      setRecState('done')
      router.push(`/dashboard/session/${appointmentId}`)
    },
  })

  // Grabación de audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
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

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const jitsiUrl = appt?.video_room_url

  const isCompleted = appt?.status === 'completed'

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-white text-sm font-medium">Sesión en curso</p>
            {appt && (
              <p className="text-gray-400 text-xs">
                {new Date(appt.scheduled_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{appt.duration_min} min
              </p>
            )}
          </div>
        </div>

        {role === 'psychologist' && (
          <div className="flex items-center gap-2">
            {/* Grabador */}
            {!isCompleted && (
              recState === 'idle' ? (
                <button onClick={startRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200 text-xs hover:bg-gray-600">
                  <Mic size={13} /> Grabar audio
                </button>
              ) : recState === 'recording' ? (
                <button onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs animate-pulse">
                  <Square size={13} /> {fmt(recSeconds)} Detener
                </button>
              ) : recState === 'stopped' && audioBlob ? (
                <button
                  onClick={() => { setRecState('uploading'); uploadAudio.mutate(audioBlob) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs">
                  <Upload size={13} /> Subir {fmt(recSeconds)}
                </button>
              ) : recState === 'uploading' ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-gray-300 text-xs">
                  <Loader2 size={13} className="animate-spin" /> Subiendo...
                </span>
              ) : null
            )}

            {/* Finalizar sesión */}
            {!isCompleted ? (
              <button
                onClick={() => complete.mutate()}
                disabled={complete.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700">
                {complete.isPending
                  ? <><Loader2 size={13} className="animate-spin" /> Finalizando...</>
                  : <><CheckCircle size={13} /> Finalizar sesión</>}
              </button>
            ) : (
              <button
                onClick={() => router.push(`/dashboard/session/${appointmentId}`)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700">
                <Brain size={13} /> Ir al resumen IA
              </button>
            )}
          </div>
        )}
      </div>

      {/* Jitsi iframe */}
      <div className="flex-1 relative">
        {jitsiUrl ? (
          <iframe
            src={jitsiUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="w-full h-full border-0"
            title="Videollamada BrainMind"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Cargando sala de videollamada...</p>
            </div>
          </div>
        )}

        {/* Banner sesión completada */}
        {isCompleted && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-900/90 border border-green-700 text-green-200 px-5 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle size={16} />
            Sesión finalizada · {role === 'psychologist' ? 'Genera el resumen IA' : 'Tu psicólogo preparará el resumen'}
          </div>
        )}
      </div>
    </div>
  )
}
