'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { subscriptionApi } from '@/lib/api'
import { Check, Sparkles, Building2, Zap, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const PLAN_ICONS: Record<string, any> = { free: Zap, pro: Sparkles, clinic: Building2 }
const PLAN_COLORS: Record<string, string> = {
  free:   'border-clinical-200',
  pro:    'border-brand-500 ring-2 ring-brand-500/20',
  clinic: 'border-accent-purple ring-2 ring-purple-500/20',
}
const PLAN_BADGE: Record<string, string | null> = { free: null, pro: 'Más popular', clinic: 'Para clínicas' }

function SubscriptionContent() {
  const searchParams = useSearchParams()
  const success   = searchParams.get('success')
  const cancelled = searchParams.get('cancelled')

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => subscriptionApi.getStatus().then(r => r.data),
  })

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: () => subscriptionApi.getPlans().then(r => r.data),
  })

  const checkout = useMutation({
    mutationFn: (plan: string) => subscriptionApi.createCheckout(plan).then(r => r.data),
    onSuccess: (data) => { if (data.checkout_url) window.location.href = data.checkout_url },
  })

  const cancelSub = useMutation({
    mutationFn: () => subscriptionApi.cancel().then(r => r.data),
  })

  const plans = plansData
    ? Object.entries(plansData).map(([key, val]: [string, any]) => ({ key, ...val }))
    : []

  return (
    <div className="anim-slide-up max-w-4xl">
      <div className="mb-8">
        <h1 className="page-title">Suscripción</h1>
        <p className="page-subtitle">Elige el plan que mejor se adapta a tu consulta</p>
      </div>

      {success && (
        <div className="mb-6 card p-4 bg-emerald-50 border-emerald-200 flex items-center gap-3 text-emerald-700">
          <Check size={18} className="text-emerald-500" />
          <p className="font-semibold text-sm">¡Suscripción activada! Bienvenido a BrainMind Pro 🎉</p>
        </div>
      )}
      {cancelled && (
        <div className="mb-6 card p-4 bg-amber-50 border-amber-200 flex items-center gap-3 text-amber-700">
          <X size={18} className="text-amber-500" />
          <p className="text-sm">Proceso cancelado. Tu plan actual no ha cambiado.</p>
        </div>
      )}

      {/* Plan actual */}
      {!loadingStatus && status && (
        <div className="card p-5 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
              <Sparkles size={18} className="text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-clinical-400 font-semibold uppercase tracking-wide">Plan actual</p>
              <p className="font-bold text-clinical-900">{status.plan_name}
                {status.status === 'trialing' && <span className="badge-cyan ml-2">Trial</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            {status.current_period_end && (
              <p className="text-xs text-clinical-400">
                {status.cancel_at_period_end ? 'Cancela el' : 'Renueva el'}{' '}
                {new Date(status.current_period_end).toLocaleDateString('es-ES')}
              </p>
            )}
            {status.is_pro && !status.cancel_at_period_end && (
              <button
                onClick={() => cancelSub.mutate()}
                disabled={cancelSub.isPending}
                className="text-xs text-red-500 hover:underline mt-1"
              >
                {cancelSub.isPending ? 'Cancelando...' : 'Cancelar suscripción'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Planes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan) => {
          const Icon = PLAN_ICONS[plan.key] || Zap
          const isCurrent = status?.plan === plan.key
          const badge = PLAN_BADGE[plan.key]

          return (
            <div
              key={plan.key}
              className={`card p-6 relative flex flex-col ${PLAN_COLORS[plan.key] || ''} ${isCurrent ? 'bg-brand-50' : ''}`}
            >
              {badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="badge-blue px-3 py-1 text-xs font-bold shadow-sm">{badge}</span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  plan.key === 'pro' ? 'bg-brand-600 text-white' :
                  plan.key === 'clinic' ? 'bg-purple-600 text-white' :
                  'bg-clinical-100 text-clinical-500'
                }`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-bold text-clinical-900">{plan.name}</p>
                  <p className="text-lg font-extrabold text-clinical-900">
                    {plan.price_eur === 0 ? 'Gratis' : `${(plan.price_eur / 100).toFixed(0)}€`}
                    {plan.price_eur > 0 && <span className="text-sm font-normal text-clinical-400">/mes</span>}
                  </p>
                </div>
              </div>

              <ul className="space-y-2 flex-1 mb-6">
                {plan.features?.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-clinical-700">
                    <Check size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
                {plan.locked?.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-clinical-400">
                    <X size={14} className="text-clinical-300 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="btn-secondary w-full text-center py-2.5 text-sm opacity-60 cursor-default">
                  Plan actual
                </div>
              ) : plan.key === 'free' ? (
                <div className="text-center text-xs text-clinical-400 py-2">Siempre disponible</div>
              ) : (
                <button
                  onClick={() => checkout.mutate(plan.key)}
                  disabled={checkout.isPending}
                  className={`btn w-full py-2.5 text-sm ${plan.key === 'pro' ? 'btn-primary' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm active:scale-[0.98]'}`}
                >
                  {checkout.isPending ? 'Redirigiendo...' : `Activar ${plan.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-clinical-400 text-center mt-6">
        Pago procesado de forma segura por Stripe. Cancela cuando quieras.
      </p>
    </div>
  )
}

export default function SubscriptionPage() {
  return <Suspense><SubscriptionContent /></Suspense>
}
