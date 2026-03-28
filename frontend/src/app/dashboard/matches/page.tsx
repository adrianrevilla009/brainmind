'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { matchesApi } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { Sparkles, CheckCircle, XCircle, RefreshCw, Star } from 'lucide-react'

export default function MatchesPage() {
  const qc = useQueryClient()
  const [generating, setGenerating] = useState(false)

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => matchesApi.getMyMatches().then((r) => r.data),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) =>
      matchesApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await matchesApi.generate()
      qc.invalidateQueries({ queryKey: ['matches'] })
    } finally {
      setGenerating(false)
    }
  }

  const pending  = matches.filter((m: any) => m.status === 'pending')
  const accepted = matches.filter((m: any) => m.status === 'accepted')
  const rejected = matches.filter((m: any) => m.status === 'rejected')

  return (
    <div>
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>Tus psicólogos</h1>
          <p className="page-subtitle">Psicólogos compatibles con tu perfil</p>
        </div>
        <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2">
          {generating ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {generating ? 'Buscando...' : 'Buscar matches'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400 text-lg">Cargando...</div>
      ) : matches.length === 0 ? (
        <div className="card p-20 text-center">
          <Sparkles size={56} className="text-brand-200 mx-auto mb-5" />
          <h2 className="text-xl font-bold text-gray-900 mb-3">Sin matches todavía</h2>
          <p className="text-base text-gray-500 mb-8 max-w-sm mx-auto">
            Pulsa "Buscar matches" para que nuestra IA encuentre los psicólogos más compatibles contigo.
          </p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mx-auto flex items-center gap-2">
            <Sparkles size={18} /> Buscar ahora
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <p className="section-title">Sugerencias ({pending.length})</p>
              <div className="grid gap-5">
                {pending.map((match: any) => (
                  <MatchCard key={match.id} match={match}
                    onAccept={() => updateStatus.mutate({ id: match.id, status: 'accepted' })}
                    onReject={() => updateStatus.mutate({ id: match.id, status: 'rejected' })} />
                ))}
              </div>
            </section>
          )}
          {accepted.length > 0 && (
            <section>
              <p className="section-title">Activos ({accepted.length})</p>
              <div className="grid gap-5">
                {accepted.map((match: any) => (
                  <MatchCard key={match.id} match={match} accepted />
                ))}
              </div>
            </section>
          )}
          {rejected.length > 0 && (
            <section>
              <p className="section-title">Descartados ({rejected.length})</p>
              <div className="grid gap-5 opacity-50">
                {rejected.map((match: any) => (
                  <MatchCard key={match.id} match={match} rejected />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, onAccept, onReject, accepted, rejected }: any) {
  const psych = match.psychologist
  const score = match.compatibility_score ? Math.round(match.compatibility_score * 100) : null

  return (
    <div className="card p-7 flex gap-6">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-sage-200 to-sage-300 flex items-center justify-center flex-shrink-0 text-sage-700 font-bold text-2xl">
        {psych?.full_name?.[0] || '?'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{psych?.full_name || 'Psicólogo'}</h3>
            {psych?.city && <p className="text-base text-gray-500">{psych.city}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            {score && (
              <div className="flex items-center gap-1.5 justify-end">
                <Star size={16} className="text-amber-400 fill-amber-400" />
                <span className="text-lg font-bold text-gray-900">{score}%</span>
              </div>
            )}
            {psych?.session_price_eur && (
              <p className="text-sm text-gray-500 mt-0.5">{formatPrice(psych.session_price_eur)}/sesión</p>
            )}
          </div>
        </div>

        {psych?.bio && (
          <p className="text-base text-gray-600 mb-4 line-clamp-2">{psych.bio}</p>
        )}

        {(psych?.specializations?.length > 0 || psych?.approaches?.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {[...(psych?.specializations || []).slice(0, 2), ...(psych?.approaches || []).slice(0, 2)].map((tag: string) => (
              <span key={tag} className="badge bg-gray-100 text-gray-600 text-sm">{tag}</span>
            ))}
          </div>
        )}

        {match.match_reasons?.length > 0 && !accepted && !rejected && (
          <div className="flex flex-wrap gap-2 mb-5">
            {match.match_reasons.map((r: string) => (
              <span key={r} className="badge bg-brand-50 text-brand-700 text-sm">{r}</span>
            ))}
          </div>
        )}

        {!accepted && !rejected && (
          <div className="flex gap-3 mt-4">
            <button onClick={onAccept}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-green-600 text-white text-base font-semibold hover:bg-green-700">
              <CheckCircle size={18} /> Conectar
            </button>
            <button onClick={onReject}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-base font-semibold hover:bg-gray-50">
              <XCircle size={18} /> Descartar
            </button>
          </div>
        )}

        {accepted && (
          <span className="inline-flex items-center gap-2 mt-3 badge bg-green-100 text-green-700 text-sm">
            <CheckCircle size={14} /> Psicólogo activo
          </span>
        )}
      </div>
    </div>
  )
}
