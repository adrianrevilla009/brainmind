'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profilesApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { SPECIALIZATIONS, APPROACHES, formatPrice } from '@/lib/utils'
import { Save, LogOut, Shield } from 'lucide-react'

export default function SettingsPage() {
  const role = useAuthStore((s) => s.role)
  const logout = useAuthStore((s) => s.logout)
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona tu perfil y preferencias</p>
      </div>
      <div className="max-w-2xl space-y-6">
        {role === 'psychologist' ? <PsychologistSettings /> : <PatientSettings />}
        {/* RGPD / Cuenta */}
        <div className="card p-5">
          <h2 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
            <Shield size={16} className="text-brand-500" />
            Privacidad y cuenta
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Solicitar mis datos (RGPD)</p>
                <p className="text-xs text-gray-500">Recibe un export de todos tus datos en 30 días</p>
              </div>
              <button className="btn-secondary text-xs">Solicitar</button>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Eliminar mi cuenta</p>
                <p className="text-xs text-gray-500">Borrado permanente de todos tus datos</p>
              </div>
              <button className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">
                Eliminar
              </button>
            </div>
            <div className="pt-1">
              <button onClick={logout}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors">
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PsychologistSettings() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile-psych'],
    queryFn: () => profilesApi.getPsychologistMe().then((r) => r.data),
  })

  const [bio, setBio] = useState(profile?.bio || '')
  const [license, setLicense] = useState(profile?.license_number || '')
  const [price, setPrice] = useState(profile ? String(profile.session_price_eur / 100) : '70')
  const [city, setCity] = useState(profile?.city || '')
  const [specs, setSpecs] = useState<string[]>(profile?.specializations || [])
  const [approaches, setApproaches] = useState<string[]>(profile?.approaches || [])

  const update = useMutation({
    mutationFn: (data: any) => profilesApi.updatePsychologist(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-psych'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggle = (arr: string[], set: (a: string[]) => void, item: string) =>
    set(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item])

  const handleSave = () => update.mutate({
    bio, license_number: license,
    session_price_eur: parseInt(price) * 100,
    city, specializations: specs, approaches,
  })

  return (
    <div className="card p-5 space-y-5">
      <h2 className="font-medium text-gray-900">Perfil profesional</h2>

      <div>
        <label className="label">Número de colegiado</label>
        <input className="input" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="M-12345" />
      </div>

      <div>
        <label className="label">Presentación</label>
        <textarea className="input min-h-[100px] resize-none" value={bio}
          onChange={(e) => setBio(e.target.value)} placeholder="Describe tu experiencia y forma de trabajar..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Precio por sesión (€)</label>
          <input type="number" className="input" min="10" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label className="label">Ciudad</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Madrid" />
        </div>
      </div>

      <div>
        <label className="label">Especializaciones</label>
        <div className="flex flex-wrap gap-2">
          {SPECIALIZATIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggle(specs, setSpecs, s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                specs.includes(s) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Enfoques terapéuticos</label>
        <div className="flex flex-wrap gap-2">
          {APPROACHES.map((a) => (
            <button key={a} type="button" onClick={() => toggle(approaches, setApproaches, a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                approaches.includes(a) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              }`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={update.isPending}
        className="btn-primary flex items-center gap-2">
        <Save size={14} />
        {update.isPending ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function PatientSettings() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [goals, setGoals] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [consentAI, setConsentAI] = useState(false)
  const [consentTranscription, setConsentTranscription] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile-patient'],
    queryFn: () => profilesApi.getPatientMe().then((r) => r.data),
  })

  // Inicializar estado cuando lleguen los datos del perfil
  if (profile && !initialized) {
    setGoals(profile.therapy_goals || '')
    setIssues(profile.presenting_issues || [])
    setConsentAI(profile.consent_ai_analysis || false)
    setConsentTranscription(profile.consent_transcription || false)
    setInitialized(true)
  }

  const update = useMutation({
    mutationFn: (data: any) => profilesApi.updatePatient(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-patient'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggle = (item: string) =>
    setIssues(issues.includes(item) ? issues.filter((i) => i !== item) : [...issues, item])

  return (
    <div className="card p-5 space-y-5">
      <h2 className="font-medium text-gray-900">Mi perfil</h2>

      <div>
        <label className="label">Mis objetivos terapéuticos</label>
        <textarea className="input min-h-[80px] resize-none" value={goals}
          onChange={(e) => setGoals(e.target.value)} placeholder="¿Qué quieres conseguir con la terapia?" />
      </div>

      <div>
        <label className="label">Motivos de consulta</label>
        <div className="flex flex-wrap gap-2">
          {SPECIALIZATIONS.map((s) => (
            <button key={s} type="button" onClick={() => toggle(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                issues.includes(s) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-medium text-blue-800 mb-3">Consentimientos RGPD</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={consentAI}
            onChange={(e) => setConsentAI(e.target.checked)} />
          <span className="text-xs text-gray-600">
            <strong>Análisis con IA</strong> — Permitir que la IA genere resúmenes y sugerencias para mi psicólogo.
            Mis datos se seudonimizarán antes de cualquier análisis externo.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer mt-3">
          <input type="checkbox" className="mt-0.5" checked={consentTranscription}
            onChange={(e) => setConsentTranscription(e.target.checked)} />
          <span className="text-xs text-gray-600">
            <strong>Transcripción de sesiones</strong> — Permitir que Whisper transcriba el audio de las sesiones.
            El audio se procesa localmente y nunca sale del servidor.
          </span>
        </label>
      </div>

      <button onClick={() => update.mutate({ therapy_goals: goals, presenting_issues: issues, consent_ai_analysis: consentAI, consent_transcription: consentTranscription })}
        disabled={update.isPending}
        className="btn-primary flex items-center gap-2">
        <Save size={14} />
        {update.isPending ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'}
      </button>
    </div>
  )
}
