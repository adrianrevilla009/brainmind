'use client'
import { useQuery } from '@tanstack/react-query'
import { chatApi } from '@/lib/api'
import Link from 'next/link'
import { MessageSquare, Clock, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ChatPage() {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations().then(r => r.data),
    refetchInterval: 10_000,
  })

  return (
    <div className="anim-slide-up">
      <div className="mb-8">
        <h1 className="page-title">Mensajes</h1>
        <p className="page-subtitle">Comunícate con tus {conversations.length > 0 ? `${conversations.length} ` : ''}contactos entre sesiones</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="skeleton h-20 w-full" />)}
        </div>
      ) : conversations.length === 0 ? (
        <div className="card p-16 text-center anim-fade-in">
          <MessageSquare size={48} className="text-clinical-200 mx-auto mb-4" />
          <p className="text-clinical-500 font-medium">No tienes conversaciones activas</p>
          <p className="text-sm text-clinical-400 mt-1">Los mensajes aparecen cuando tienes un match aceptado</p>
        </div>
      ) : (
        <div className="card overflow-hidden stagger">
          {conversations.map((conv: any, i: number) => (
            <Link
              key={conv.match_id}
              href={`/dashboard/chat/${conv.match_id}`}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-clinical-50 transition-colors anim-fade-in ${
                i < conversations.length - 1 ? 'border-b border-clinical-100' : ''
              }`}
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {conv.other_name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="font-semibold text-clinical-900 text-sm">{conv.other_name}</p>
                  {conv.last_message_at && (
                    <span className="text-[11px] text-clinical-400 flex items-center gap-1">
                      <Clock size={10} />
                      {formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: true })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-clinical-500 truncate">
                  {conv.last_message || 'Sin mensajes aún — saluda primero 👋'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {conv.unread_count > 0 && (
                  <span className="min-w-[20px] h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center px-1.5">
                    {conv.unread_count}
                  </span>
                )}
                <ChevronRight size={15} className="text-clinical-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
