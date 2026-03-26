'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [role, setRole] = useState<'patient' | 'psychologist'>(
    (searchParams.get('role') as any) || 'patient'
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.register({ email, password, role, full_name: fullName })
      setAuth(res.data.access_token, res.data.role, res.data.user_id)
      router.push('/onboarding')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold">B</div>
            <span className="text-xl font-semibold text-gray-900">BrainMind</span>
          </Link>
          <h1 className="text-2xl text-gray-900 font-normal" style={{ fontFamily: 'var(--font-serif)' }}>
            Crear cuenta
          </h1>
        </div>

        {/* Selector de rol */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {(['patient', 'psychologist'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                role === r
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {r === 'patient' ? '🙋 Soy paciente' : '🩺 Soy psicólogo'}
            </button>
          ))}
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            <div>
              <label className="label">Nombre completo</label>
              <input className="input" placeholder="Ana García López" value={fullName}
                onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="tu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={password}
                onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex justify-center">
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-brand-600 font-medium hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}
