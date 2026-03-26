'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { matchesApi } from '@/lib/api'
import { CheckCircle, XCircle, Calendar, Users, ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PatientsPage() {
  const qc     = useQueryClient()
  const router = useRouter()

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => matchesApi.getMyMatches().then(r => r.data),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) =>
      matchesApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
  })

  const pending  = matches.filter((m: any) => m.status === 'pending')
  const accepted = matches.filter((m: any) => m.status === 'accepted')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>Pacientes</h1>
        <p className="text-gray-500 text-sm mt-1">
          {accepted.length} activo{accepted.length !== 1 ? 's' : ''}
          {pending.length > 0 && ` · ${pending.length} pendiente${pending.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : matches.length === 0 ? (
        <div className="card p-16 text-center">
          <Users size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Todavía no tienes solicitudes de pacientes</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Solicitudes pendientes ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map((m: any) => (
                  <PatientCard key={m.id} match={m}
                    onAccept={() => updateStatus.mutate({ id: m.id, status: 'accepted' })}
                    onReject={() => updateStatus.mutate({ id: m.id, status: 'rejected' })} />
                ))}
              </div>
            </section>
          )}
          {accepted.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Pacientes activos ({accepted.length})
              </h2>
              <div className="space-y-3">
                {accepted.map((m: any) => (
                  <PatientCard key={m.id} match={m} active />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function PatientCard({ match: m, onAccept, onReject, active }: any) {
  const router = useRouter()
  return (
    <div className="card p-5 flex gap-4">
      <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0 text-brand-700 font-semibold">
        {active ? (m.patient_name?.[0] || 'P') : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900 text-sm">
              {active ? (m.patient_name || 'Paciente') : 'Paciente anónimo'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Solicitud {new Date(m.created_at).toLocaleDateString('es-ES')}
            </p>
          </div>
          {m.compatibility_score && (
            <span className="badge bg-brand-50 text-brand-700 text-xs flex-shrink-0">
              {Math.round(m.compatibility_score * 100)}% compatible
            </span>
          )}
        </div>

        {m.match_reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {m.match_reasons.map((r: string) => (
              <span key={r} className="badge bg-gray-100 text-gray-600 text-xs">{r}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {!active && onAccept && (
            <>
              <button onClick={onAccept}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-xs font-medium hover:bg-green-700">
                <CheckCircle size={13} /> Aceptar
              </button>
              <button onClick={onReject}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
                <XCircle size={13} /> Rechazar
              </button>
            </>
          )}
          {active && (
            <>
              <Link href="/dashboard/appointments"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50">
                <Calendar size={13} /> Ver citas
              </Link>
              <button
                onClick={() => router.push(`/dashboard/history/${m.patient_id}`)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-purple-200 text-purple-600 text-xs font-medium hover:bg-purple-50">
                <ClipboardList size={13} /> Historial clínico
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
