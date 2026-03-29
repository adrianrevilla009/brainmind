'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(email, password)
      setAuth(res.data.access_token, res.data.role, res.data.user_id)
      router.push('/dashboard')
    } catch (err: any) {
      const status = err.response?.status
      const detail = err.response?.data?.detail || 'Credenciales incorrectas'
      if (status === 403) {
        // Email no verificado — guardar token si viene en la respuesta y redirigir
        router.push('/verify-email')
        return
      }
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold">B</div>
            <span className="text-xl font-semibold text-gray-900">BrainMind</span>
          </Link>
          <h1 className="text-2xl text-gray-900 font-normal" style={{ fontFamily: 'var(--font-serif)' }}>
            Bienvenido de nuevo
          </h1>
          <p className="text-gray-500 text-sm mt-1">Accede a tu cuenta</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                <p>{error}</p>
                {error.includes('verifica') && (
                  <button
                    type="button"
                    onClick={() => router.push('/verify-email')}
                    className="mt-2 text-red-600 underline text-xs font-medium">
                    Reenviar email de verificación →
                  </button>
                )}
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
              {loading ? 'Accediendo...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="text-brand-600 font-medium hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
