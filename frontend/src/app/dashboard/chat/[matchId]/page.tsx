'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useParams } from 'next/navigation'
import { Send, ArrowLeft, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ChatConversationPage() {
  const params = useParams()
  const matchId = params.matchId as string
  const userId = useAuthStore(s => s.userId)
  const qc = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', matchId],
    queryFn: () => chatApi.getMessages(matchId).then(r => r.data),
    refetchInterval: 3_000,
  })

  const { data: convs = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.getConversations().then(r => r.data),
  })
  const conv = (convs as any[]).find(c => c.match_id === matchId)

  const send = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage(matchId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', matchId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
      setText('')
    },
  })

  // Scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!text.trim() || send.isPending) return
    send.mutate(text.trim())
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Agrupar mensajes por fecha
  const grouped: { date: string; msgs: any[] }[] = []
  messages.forEach((m: any) => {
    const d = format(new Date(m.created_at), 'EEEE, d MMMM', { locale: es })
    if (!grouped.length || grouped[grouped.length - 1].date !== d) {
      grouped.push({ date: d, msgs: [m] })
    } else {
      grouped[grouped.length - 1].msgs.push(m)
    }
  })

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] anim-fade-in">
      {/* Header */}
      <div className="card px-5 py-4 mb-4 flex items-center gap-4">
        <Link href="/dashboard/chat" className="btn-ghost p-2 rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold flex-shrink-0">
          {conv?.other_name?.charAt(0) || '?'}
        </div>
        <div>
          <p className="font-semibold text-clinical-900">{conv?.other_name || 'Conversación'}</p>
          <p className="text-xs text-clinical-400">Chat entre sesiones</p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto card px-5 py-4 mb-4 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className={`skeleton h-10 w-48 ${i % 2 === 0 ? 'ml-auto' : ''}`} />)}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-clinical-400 text-sm">Sé el primero en escribir 👋</p>
          </div>
        )}

        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Separador de fecha */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-clinical-100" />
              <span className="text-[11px] font-semibold text-clinical-400 capitalize">{date}</span>
              <div className="flex-1 h-px bg-clinical-100" />
            </div>

            <div className="space-y-2">
              {msgs.map((m: any) => {
                const isMine = m.is_mine
                return (
                  <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? 'bg-brand-600 text-white rounded-br-md'
                        : 'bg-white border border-clinical-100 text-clinical-800 rounded-bl-md'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[10px] ${isMine ? 'text-brand-200' : 'text-clinical-400'}`}>
                          {format(new Date(m.created_at), 'HH:mm')}
                        </span>
                        {isMine && (
                          <CheckCheck size={11} className={m.read_at ? 'text-cyan-300' : 'text-brand-300'} />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="card px-4 py-3 flex items-end gap-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escribe un mensaje... (Enter para enviar)"
          rows={1}
          className="flex-1 input resize-none min-h-[44px] max-h-32 py-2.5"
          style={{ height: 'auto' }}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement
            t.style.height = 'auto'
            t.style.height = Math.min(t.scrollHeight, 128) + 'px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || send.isPending}
          className="btn-primary p-3 rounded-xl flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
