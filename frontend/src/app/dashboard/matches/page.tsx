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

  const pending = matches.filter((m: any) => m.status === 'pending')
  const accepted = matches.filter((m: any) => m.status === 'accepted')
  const rejected = matches.filter((m: any) => m.status === 'rejected')

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
            Tus psicólogos
          </h1>
          <p className="text-gray-500 text-sm mt-1">Psicólogos compatibles con tu perfil</p>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="btn-primary flex items-center gap-2">
          {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? 'Buscando...' : 'Buscar matches'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : matches.length === 0 ? (
        <div className="card p-16 text-center">
          <Sparkles size={40} className="text-brand-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">Sin matches todavía</h2>
          <p className="text-gray-500 text-sm mb-6">
            Pulsa "Buscar matches" para que nuestra IA encuentre los psicólogos más compatibles contigo.
          </p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mx-auto flex items-center gap-2">
            <Sparkles size={14} />
            Buscar ahora
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Sugerencias ({pending.length})
              </h2>
              <div className="grid gap-4">
                {pending.map((match: any) => (
                  <MatchCard key={match.id} match={match}
                    onAccept={() => updateStatus.mutate({ id: match.id, status: 'accepted' })}
                    onReject={() => updateStatus.mutate({ id: match.id, status: 'rejected' })}
                  />
                ))}
              </div>
            </section>
          )}

          {accepted.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Activos ({accepted.length})
              </h2>
              <div className="grid gap-4">
                {accepted.map((match: any) => (
                  <MatchCard key={match.id} match={match} accepted />
                ))}
              </div>
            </section>
          )}

          {rejected.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Descartados ({rejected.length})
              </h2>
              <div className="grid gap-4 opacity-50">
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
    <div className="card p-5 flex gap-5">
      {/* Avatar */}
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sage-200 to-sage-300 flex items-center justify-center flex-shrink-0 text-sage-700 font-semibold text-xl">
        {psych?.full_name?.[0] || '?'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-medium text-gray-900">{psych?.full_name || 'Psicólogo'}</h3>
            {psych?.city && <p className="text-xs text-gray-500">{psych.city}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            {score && (
              <div className="flex items-center gap-1 justify-end">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                <span className="text-sm font-medium text-gray-900">{score}%</span>
              </div>
            )}
            {psych?.session_price_eur && (
              <p className="text-xs text-gray-500 mt-0.5">{formatPrice(psych.session_price_eur)}/sesión</p>
            )}
          </div>
        </div>

        {/* Bio */}
        {psych?.bio && (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{psych.bio}</p>
        )}

        {/* Tags */}
        {(psych?.specializations?.length > 0 || psych?.approaches?.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[...(psych?.specializations || []).slice(0, 2), ...(psych?.approaches || []).slice(0, 2)].map((tag: string) => (
              <span key={tag} className="badge bg-gray-100 text-gray-600">{tag}</span>
            ))}
          </div>
        )}

        {/* Match reasons */}
        {match.match_reasons?.length > 0 && !accepted && !rejected && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {match.match_reasons.map((r: string) => (
              <span key={r} className="badge bg-brand-50 text-brand-700">{r}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        {!accepted && !rejected && (
          <div className="flex gap-2 mt-4">
            <button onClick={onAccept}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
              <CheckCircle size={14} />
              Conectar
            </button>
            <button onClick={onReject}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
              <XCircle size={14} />
              Descartar
            </button>
          </div>
        )}

        {accepted && (
          <span className="inline-flex items-center gap-1.5 mt-3 badge bg-green-100 text-green-700">
            <CheckCircle size={12} />
            Psicólogo activo
          </span>
        )}
      </div>
    </div>
  )
}
