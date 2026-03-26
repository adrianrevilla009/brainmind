'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { appointmentsApi, paymentsApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { formatPrice, formatDateTime } from '@/lib/utils'
import { CreditCard, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react'

export default function PaymentsPage() {
  const role = useAuthStore((s) => s.role)
  return role === 'psychologist' ? <PsychologistPayments /> : <PatientPayments />
}

function PatientPayments() {
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', 'confirmed'],
    queryFn: () => appointmentsApi.getMyAppointments('confirmed').then((r) => r.data),
  })

  const unpaid = appointments.filter((a: any) => !a.payment_id)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>Pagos</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona tus pagos de sesiones</p>
      </div>

      {unpaid.length === 0 ? (
        <div className="card p-16 text-center">
          <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Todo al día</p>
          <p className="text-gray-500 text-sm mt-1">No tienes pagos pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Pagos pendientes ({unpaid.length})
          </h2>
          {unpaid.map((a: any) => (
            <PaymentCard key={a.id} appointment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function PaymentCard({ appointment: a }: { appointment: any }) {
  const [loading, setLoading] = useState(false)
  const [paid, setPaid] = useState(false)

  const handlePay = async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.createIntent(a.id)
      // En demo sin Stripe configurado mostramos éxito
      if (res.data.client_secret === 'demo_client_secret') {
        setPaid(true)
        return
      }
      // Con Stripe real: redirigir al checkout o abrir modal de Stripe Elements
      alert(`Stripe client secret: ${res.data.client_secret}\n\nIntegra @stripe/react-stripe-js para el pago real.`)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error al procesar pago')
    } finally {
      setLoading(false)
    }
  }

  if (paid) {
    return (
      <div className="card p-4 flex items-center gap-4">
        <CheckCircle size={24} className="text-green-500 flex-shrink-0" />
        <div>
          <p className="font-medium text-gray-900 text-sm">Pago completado</p>
          <p className="text-xs text-gray-500">{formatDateTime(a.scheduled_at)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
        <CreditCard size={18} className="text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900 text-sm">Sesión del {formatDateTime(a.scheduled_at)}</p>
        <p className="text-xs text-gray-500">{a.duration_min} minutos</p>
      </div>
      <button onClick={handlePay} disabled={loading} className="btn-primary flex-shrink-0">
        {loading ? 'Procesando...' : 'Pagar'}
      </button>
    </div>
  )
}

function PsychologistPayments() {
  const [onboarding, setOnboarding] = useState(false)
  const [onboardUrl, setOnboardUrl] = useState('')

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => appointmentsApi.getMyAppointments().then((r) => r.data),
  })

  const completed = appointments.filter((a: any) => a.status === 'completed')

  const handleOnboard = async () => {
    setOnboarding(true)
    try {
      const res = await paymentsApi.stripeOnboard()
      if (res.data.url.startsWith('http')) {
        window.open(res.data.url, '_blank')
      } else {
        setOnboardUrl(res.data.message || 'Configura STRIPE_SECRET_KEY en tu .env para activar pagos reales.')
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error')
    } finally {
      setOnboarding(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>Cobros</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona tus ingresos y configuración de pagos</p>
      </div>

      {/* Stripe onboarding banner */}
      <div className="card p-5 mb-6 flex items-center gap-4 border-l-4 border-amber-400">
        <AlertCircle size={20} className="text-amber-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-gray-900 text-sm">Configura Stripe para recibir pagos</p>
          <p className="text-xs text-gray-500 mt-0.5">
            BrainMind aplica una comisión del 5%. El resto llega directamente a tu cuenta.
          </p>
          {onboardUrl && <p className="text-xs text-blue-600 mt-1">{onboardUrl}</p>}
        </div>
        <button onClick={handleOnboard} disabled={onboarding}
          className="btn-primary flex items-center gap-2 flex-shrink-0">
          <ExternalLink size={14} />
          {onboarding ? 'Redirigiendo...' : 'Conectar Stripe'}
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-gray-900">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-1">Sesiones completadas</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-sage-700">€—</p>
          <p className="text-xs text-gray-500 mt-1">Ingresos este mes</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold text-gray-900">5%</p>
          <p className="text-xs text-gray-500 mt-1">Comisión plataforma</p>
        </div>
      </div>

      {/* Historial */}
      <div className="card divide-y divide-gray-100">
        {completed.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No hay sesiones completadas todavía
          </div>
        ) : (
          completed.map((a: any) => (
            <div key={a.id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{formatDateTime(a.scheduled_at)}</p>
                <p className="text-xs text-gray-500">{a.duration_min} min</p>
              </div>
              <span className="badge bg-green-100 text-green-700">Completada</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
