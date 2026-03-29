'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi, authApi } from '@/lib/api'
import {
  LayoutDashboard, Calendar, Users, CreditCard,
  Settings, LogOut, Brain, Bell, BarChart2, Shield, Mail
} from 'lucide-react'
import { cn } from '@/lib/utils'

const patientNav = [
  { href: '/dashboard',               label: 'Inicio',         icon: LayoutDashboard },
  { href: '/dashboard/matches',       label: 'Mis psicólogos', icon: Users },
  { href: '/dashboard/appointments',  label: 'Mis citas',      icon: Calendar },
  { href: '/dashboard/analytics',     label: 'Mi evolución',   icon: BarChart2 },
  { href: '/dashboard/payments',      label: 'Pagos',          icon: CreditCard },
]

const psychNav = [
  { href: '/dashboard',               label: 'Inicio',    icon: LayoutDashboard },
  { href: '/dashboard/patients',      label: 'Pacientes', icon: Users },
  { href: '/dashboard/appointments',  label: 'Agenda',    icon: Calendar },
  { href: '/dashboard/payments',      label: 'Cobros',    icon: CreditCard },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, role, logout } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
  }, [isAuthenticated, router])

  // Verificar estado de email
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.me().then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount().then(r => r.data),
    refetchInterval: 30_000,
    enabled: isAuthenticated,
  })
  const unreadCount: number = unreadData?.count ?? 0

  if (!isAuthenticated) return null
  const nav = role === 'psychologist' ? psychNav : patientNav
  const showVerificationBanner = meData && meData.is_verified === false

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Banner verificación email */}
      {showVerificationBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between z-20 fixed top-0 left-0 right-0">
          <div className="flex items-center gap-3">
            <Mail size={18} className="text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <strong>Confirma tu email</strong> para acceder a todas las funciones.
              Revisa tu bandeja de entrada y pulsa el enlace que te enviamos.
            </p>
          </div>
          <button
            onClick={() => authApi.resendVerification().catch(() => {})}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap ml-4"
          >
            Reenviar email
          </button>
        </div>
      )}

      <div className={cn('flex flex-1', showVerificationBanner ? 'pt-[52px]' : '')}>
        <aside className="w-64 bg-white border-r border-gray-100 flex flex-col fixed h-full z-10" style={{ top: showVerificationBanner ? '52px' : '0' }}>
          {/* Logo */}
          <div className="px-5 py-6 border-b border-gray-100">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                <Brain size={18} className="text-white" />
              </div>
              <span className="font-semibold text-gray-900 text-base">BrainMind</span>
            </Link>
          </div>

          {/* Role badge */}
          <div className="px-5 py-3 border-b border-gray-100">
            <span className={cn('badge text-xs font-medium',
              role === 'psychologist' ? 'bg-sage-100 text-sage-800' : 'bg-brand-100 text-brand-800'
            )}>
              {role === 'psychologist' ? '🩺 Psicólogo/a' : '🙋 Paciente'}
            </span>
          </div>

          {/* Nav principal */}
          <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link key={href} href={href} className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}>
                  <Icon size={17} className={active ? 'text-brand-600' : 'text-gray-400'} />
                  {label}
                </Link>
              )
            })}

            {/* Notificaciones con badge */}
            <Link href="/dashboard/notifications" className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname === '/dashboard/notifications'
                ? 'bg-brand-50 text-brand-700 shadow-sm'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <div className="relative">
                <Bell size={17} className={pathname === '/dashboard/notifications' ? 'text-brand-600' : 'text-gray-400'} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              Notificaciones
            </Link>
          </nav>

          {/* Footer */}
          <div className="px-3 py-4 border-t border-gray-100 space-y-1">
            <Link href="/dashboard/rgpd" className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname === '/dashboard/rgpd'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <Shield size={17} className={pathname === '/dashboard/rgpd' ? 'text-brand-600' : 'text-gray-400'} />
              Privacidad
            </Link>
            <Link href="/dashboard/settings" className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              pathname === '/dashboard/settings'
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <Settings size={17} className={pathname === '/dashboard/settings' ? 'text-brand-600' : 'text-gray-400'} />
              Configuración
            </Link>
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 font-medium transition-all duration-150">
              <LogOut size={17} />
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="ml-64 flex-1 p-10 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
