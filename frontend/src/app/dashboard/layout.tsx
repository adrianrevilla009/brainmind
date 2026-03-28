'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/lib/api'
import {
  LayoutDashboard, Calendar, Users, CreditCard,
  Settings, LogOut, Brain, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'

const patientNav = [
  { href: '/dashboard',              label: 'Inicio',         icon: LayoutDashboard },
  { href: '/dashboard/matches',      label: 'Mis psicólogos', icon: Users },
  { href: '/dashboard/appointments', label: 'Mis citas',      icon: Calendar },
  { href: '/dashboard/payments',     label: 'Pagos',          icon: CreditCard },
]

const psychNav = [
  { href: '/dashboard',              label: 'Inicio',    icon: LayoutDashboard },
  { href: '/dashboard/patients',     label: 'Pacientes', icon: Users },
  { href: '/dashboard/appointments', label: 'Agenda',    icon: Calendar },
  { href: '/dashboard/payments',     label: 'Cobros',    icon: CreditCard },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, role, logout } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
  }, [isAuthenticated, router])

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.getUnreadCount().then(r => r.data),
    refetchInterval: 30_000,
    enabled: isAuthenticated,
  })
  const unreadCount: number = unreadData?.count ?? 0

  if (!isAuthenticated) return null
  const nav = role === 'psychologist' ? psychNav : patientNav

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col fixed h-full z-10 shadow-sm">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-gray-100">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center shadow-sm">
              <Brain size={20} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">BrainMind</span>
          </Link>
        </div>

        {/* Role badge */}
        <div className="px-6 py-4 border-b border-gray-100">
          <span className={cn(
            'badge text-sm font-semibold',
            role === 'psychologist' ? 'bg-sage-100 text-sage-800' : 'bg-brand-100 text-brand-800'
          )}>
            {role === 'psychologist' ? '🩺 Psicólogo' : '🙋 Paciente'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-5 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href} className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-2xl text-base font-medium transition-all',
                active
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}>
                <Icon size={20} className={active ? 'text-brand-600' : 'text-gray-400'} />
                {label}
              </Link>
            )
          })}

          {/* Notificaciones */}
          <Link href="/dashboard/notifications" className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-2xl text-base font-medium transition-all',
            pathname === '/dashboard/notifications'
              ? 'bg-brand-50 text-brand-700 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}>
            <div className="relative">
              <Bell size={20} className={pathname === '/dashboard/notifications' ? 'text-brand-600' : 'text-gray-400'} />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            Notificaciones
          </Link>
        </nav>

        {/* Footer */}
        <div className="px-4 py-5 border-t border-gray-100 space-y-1">
          <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-2xl text-base text-gray-600 hover:bg-gray-50 font-medium">
            <Settings size={20} className="text-gray-400" />
            Configuración
          </Link>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-base text-red-500 hover:bg-red-50 font-medium">
            <LogOut size={20} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="ml-64 flex-1 p-10 min-h-screen">
        {children}
      </main>
    </div>
  )
}
