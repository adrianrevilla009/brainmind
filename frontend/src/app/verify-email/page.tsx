'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'no-token'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('no-token'); return }

    api.get(`/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/dashboard'), 2500)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'El enlace es inválido o ha caducado.')
      })
  }, [token, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold">B</div>
            <span className="text-xl font-semibold text-gray-900">BrainMind</span>
          </Link>
        </div>

        <div className="card p-8 text-center">
          {status === 'loading' && (
            <>
              <Loader2 size={40} className="text-brand-500 mx-auto mb-4 animate-spin" />
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Verificando tu email...</h1>
              <p className="text-gray-500 text-sm">Un momento, por favor.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">¡Email verificado!</h1>
              <p className="text-gray-500 text-sm">Tu cuenta está activa. Redirigiendo al dashboard...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-red-500" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Enlace inválido</h1>
              <p className="text-gray-500 text-sm mb-6">{message}</p>
              <Link href="/login" className="btn-primary block text-center">
                Ir al login
              </Link>
            </>
          )}

          {status === 'no-token' && (
            <>
              <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-4">
                <Mail size={32} className="text-brand-600" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Verifica tu email</h1>
              <p className="text-gray-500 text-sm mb-6">
                Hemos enviado un enlace de verificación a tu email. Revisa tu bandeja de entrada
                y pulsa el enlace para activar tu cuenta.
              </p>
              <p className="text-xs text-gray-400">
                ¿No lo ves? Revisa la carpeta de spam o{' '}
                <button
                  onClick={() => api.post('/auth/resend-verification').catch(() => {})}
                  className="text-brand-600 hover:underline">
                  solicita un nuevo enlace
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
