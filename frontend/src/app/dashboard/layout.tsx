'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi, authApi, chatApi } from '@/lib/api'
import {
  LayoutDashboard, Calendar, Users, CreditCard, Settings,
  LogOut, Brain, Bell, BarChart2, Shield, Mail, MessageSquare,
  Star, ChevronRight, Sparkles, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const patientNav = [
  { href: '/dashboard',                  label: 'Inicio',         icon: LayoutDashboard },
  { href: '/dashboard/matches',          label: 'Mis psicólogos', icon: Users },
  { href: '/dashboard/appointments',     label: 'Mis citas',      icon: Calendar },
  { href: '/dashboard/chat',             label: 'Mensajes',       icon: MessageSquare, badge: 'chat' },
  { href: '/dashboard/analytics',        label: 'Mi evolución',   icon: BarChart2 },
  { href: '/dashboard/payments',         label: 'Pagos',          icon: CreditCard },
]

const psychNav = [
  { href: '/dashboard',                  label: 'Inicio',         icon: LayoutDashboard },
  { href: '/dashboard/patients',         label: 'Pacientes',      icon: Users },
  { href: '/dashboard/appointments',     label: 'Agenda',         icon: Calendar },
  { href: '/dashboard/chat',             label: 'Mensajes',       icon: MessageSquare, badge: 'chat' },
  { href: '/dashboard/analytics',        label: 'Analytics',      icon: Activity },
  { href: '/dashboard/subscription',     label: 'Suscripción',    icon: Sparkles },
  { href: '/dashboard/payments',         label: 'Cobros',         icon: CreditCard },
]

function NavItem({ href, label, icon: Icon, active, badgeCount }: {
  href: string; label: string; icon: any; active: boolean; badgeCount?: number
}) {
  return (
    <Link href={href} className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative',
      active
        ? 'bg-brand-600 text-white shadow-[0_2px_8px_rgba(29,71,233,0.4)]'
        : 'text-clinical-300 hover:bg-white/10 hover:text-white'
    )}>
      <Icon size={16} className={active ? 'text-white' : 'text-clinical-400 group-hover:text-white'} />
      <span className="flex-1">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      {active && <ChevronRight size={12} className="text-white/60" />}
    </Link>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, role, logout } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
  }, [isAuthenticated, router])

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

  const { data: chatData } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => chatApi.getConversations().then(r =>
      r.data.reduce((acc: number, c: any) => acc + (c.unread_count || 0), 0)
    ),
    refetchInterval: 10_000,
    enabled: isAuthenticated,
  })

  if (!isAuthenticated) return null

  const nav = role === 'psychologist' ? psychNav : patientNav
  const unreadCount: number = unreadData?.count ?? 0
  const chatUnread: number = chatData ?? 0
  const showVerificationBanner = meData && meData.is_verified === false

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Banner verificación */}
      {showVerificationBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Mail size={15} />
            Confirma tu email para activar todas las funciones
          </div>
          <button
            onClick={() => authApi.resendVerification().catch(() => {})}
            className="text-xs font-bold underline hover:no-underline ml-4"
          >
            Reenviar
          </button>
        </div>
      )}

      <div className={cn('flex flex-1', showVerificationBanner && 'pt-[44px]')}>
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside
          className="fixed left-0 flex flex-col z-40 overflow-hidden"
          style={{
            width: 'var(--sidebar-w)',
            top: showVerificationBanner ? '44px' : '0',
            bottom: 0,
            background: 'linear-gradient(180deg, #102a43 0%, #1b3a57 60%, #243b53 100%)',
          }}
        >
          {/* Logo */}
          <div className="px-5 py-5 border-b border-white/10">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
                <Brain size={18} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-base leading-tight">BrainMind</p>
                <p className="text-clinical-400 text-[10px] font-medium uppercase tracking-widest">
                  {role === 'psychologist' ? 'Psicólogo' : 'Paciente'}
                </p>
              </div>
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            <p className="section-label text-clinical-500 px-3 mb-3">Menú principal</p>
            {nav.map(({ href, label, icon, badge }) => (
              <NavItem
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={pathname === href || (href !== '/dashboard' && pathname.startsWith(href))}
                badgeCount={badge === 'chat' ? chatUnread : undefined}
              />
            ))}

            <div className="divider border-white/10 !my-4" />
            <p className="section-label text-clinical-500 px-3 mb-3">Sistema</p>

            {/* Notificaciones */}
            <NavItem
              href="/dashboard/notifications"
              label="Notificaciones"
              icon={Bell}
              active={pathname === '/dashboard/notifications'}
              badgeCount={unreadCount}
            />
            {role === 'psychologist' && (
              <NavItem
                href="/dashboard/reviews"
                label="Reseñas"
                icon={Star}
                active={pathname === '/dashboard/reviews'}
              />
            )}
          </nav>

          {/* Footer */}
          <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
            <NavItem href="/dashboard/rgpd"     label="Privacidad"     icon={Shield}   active={pathname === '/dashboard/rgpd'} />
            <NavItem href="/dashboard/settings" label="Configuración"  icon={Settings} active={pathname === '/dashboard/settings'} />
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-150"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="flex-1 min-h-screen" style={{ marginLeft: 'var(--sidebar-w)' }}>
          <div className="max-w-[1400px] mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
