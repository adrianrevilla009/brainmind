'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { profilesApi } from '@/lib/api'
import { SPECIALIZATIONS, APPROACHES } from '@/lib/utils'

export default function OnboardingPage() {
  const router = useRouter()
  const role = useAuthStore((s) => s.role)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Psicólogo fields
  const [bio, setBio] = useState('')
  const [license, setLicense] = useState('')
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([])
  const [selectedApproaches, setSelectedApproaches] = useState<string[]>([])
  const [price, setPrice] = useState('70')
  const [city, setCity] = useState('')

  // Paciente fields
  const [issues, setIssues] = useState<string[]>([])
  const [goals, setGoals] = useState('')
  const [preferredApproach, setPreferredApproach] = useState('')
  const [consentDP, setConsentDP] = useState(false)
  const [consentAI, setConsentAI] = useState(false)

  const toggleItem = (arr: string[], setArr: (a: string[]) => void, item: string) => {
    setArr(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item])
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      if (role === 'psychologist') {
        await profilesApi.updatePsychologist({
          bio, license_number: license,
          specializations: selectedSpecs,
          approaches: selectedApproaches,
          session_price_eur: parseInt(price) * 100,
          city,
        })
      } else {
        if (!consentDP) {
          setError('Debes aceptar el tratamiento de datos para continuar')
          setLoading(false)
          return
        }
        await profilesApi.updatePatient({
          presenting_issues: issues,
          therapy_goals: goals,
          preferred_approach: preferredApproach || undefined,
          consent_data_processing: consentDP,
          consent_ai_analysis: consentAI,
          consent_transcription: false,
        })
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al guardar perfil')
    } finally {
      setLoading(false)
    }
  }

  const TagButton = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        selected ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
      }`}>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold mx-auto mb-3">B</div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            {role === 'psychologist' ? 'Configura tu perfil profesional' : 'Cuéntanos sobre ti'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Solo tardas 2 minutos</p>
        </div>

        <div className="card p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          {role === 'psychologist' ? (
            <>
              <div>
                <label className="label">Número de colegiado</label>
                <input className="input" placeholder="M-12345" value={license} onChange={(e) => setLicense(e.target.value)} />
              </div>
              <div>
                <label className="label">Breve presentación</label>
                <textarea className="input min-h-[100px] resize-none" placeholder="Cuéntales a tus pacientes quién eres y cómo trabajas..."
                  value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div>
                <label className="label">Especializaciones</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALIZATIONS.map((s) => (
                    <TagButton key={s} label={s} selected={selectedSpecs.includes(s)}
                      onClick={() => toggleItem(selectedSpecs, setSelectedSpecs, s)} />
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Enfoques terapéuticos</label>
                <div className="flex flex-wrap gap-2">
                  {APPROACHES.map((a) => (
                    <TagButton key={a} label={a} selected={selectedApproaches.includes(a)}
                      onClick={() => toggleItem(selectedApproaches, setSelectedApproaches, a)} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Precio por sesión (€)</label>
                  <input type="number" className="input" min="10" max="300" value={price}
                    onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div>
                  <label className="label">Ciudad</label>
                  <input className="input" placeholder="Madrid" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">¿Qué te trae aquí? (puedes elegir varios)</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALIZATIONS.map((s) => (
                    <TagButton key={s} label={s} selected={issues.includes(s)}
                      onClick={() => toggleItem(issues, setIssues, s)} />
                  ))}
                </div>
              </div>
              <div>
                <label className="label">¿Qué te gustaría conseguir con la terapia?</label>
                <textarea className="input min-h-[80px] resize-none" placeholder="Cuéntanos tus objetivos..."
                  value={goals} onChange={(e) => setGoals(e.target.value)} />
              </div>
              <div>
                <label className="label">¿Tienes preferencia por algún enfoque? (opcional)</label>
                <select className="input" value={preferredApproach} onChange={(e) => setPreferredApproach(e.target.value)}>
                  <option value="">Sin preferencia</option>
                  {APPROACHES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {/* Consentimientos RGPD */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-blue-800">Consentimientos (Art. 9 RGPD)</p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={consentDP} onChange={(e) => setConsentDP(e.target.checked)} />
                  <span className="text-xs text-gray-600">
                    <strong>Tratamiento de datos de salud</strong> — Acepto que BrainMind almacene y procese mis datos de salud mental para conectarme con mi psicólogo y gestionar mis sesiones. <strong className="text-red-600">Obligatorio.</strong>
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={consentAI} onChange={(e) => setConsentAI(e.target.checked)} />
                  <span className="text-xs text-gray-600">
                    <strong>Análisis con IA</strong> — Acepto que se utilice inteligencia artificial para generar sugerencias y resúmenes para mi psicólogo. Mis datos se seudonimizarán antes de cualquier análisis externo. <strong>Opcional.</strong>
                  </span>
                </label>
              </div>
            </>
          )}

          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full flex justify-center">
            {loading ? 'Guardando...' : 'Ir a mi dashboard →'}
          </button>
        </div>
      </div>
    </div>
  )
}
