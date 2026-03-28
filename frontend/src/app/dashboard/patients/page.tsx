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
      <div className="page-header">
        <h1 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>Pacientes</h1>
        <p className="page-subtitle">
          {accepted.length} activo{accepted.length !== 1 ? 's' : ''}
          {pending.length > 0 && ` · ${pending.length} solicitud${pending.length !== 1 ? 'es' : ''} pendiente${pending.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400 text-lg">Cargando...</div>
      ) : matches.length === 0 ? (
        <div className="card p-20 text-center">
          <Users size={56} className="text-gray-200 mx-auto mb-5" />
          <p className="text-lg text-gray-500">Todavía no tienes solicitudes de pacientes</p>
          <p className="text-base text-gray-400 mt-2">Los pacientes te encontrarán a través del sistema de matching</p>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <p className="section-title">Solicitudes pendientes ({pending.length})</p>
              <div className="space-y-4">
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
              <p className="section-title">Pacientes activos ({accepted.length})</p>
              <div className="space-y-4">
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
    <div className="card p-6 flex gap-5">
      <div className="w-14 h-14 rounded-3xl bg-brand-100 flex items-center justify-center flex-shrink-0 text-brand-700 font-bold text-xl">
        {active ? (m.patient_name?.[0] || 'P') : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-lg font-bold text-gray-900">
              {active ? (m.patient_name || 'Paciente') : 'Paciente anónimo'}
            </p>
            <p className="text-sm text-gray-500">
              Solicitud {new Date(m.created_at).toLocaleDateString('es-ES')}
            </p>
          </div>
          {m.compatibility_score && (
            <span className="badge bg-brand-50 text-brand-700 text-sm flex-shrink-0">
              {Math.round(m.compatibility_score * 100)}% compatible
            </span>
          )}
        </div>

        {m.match_reasons?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {m.match_reasons.map((r: string) => (
              <span key={r} className="badge bg-gray-100 text-gray-600 text-sm">{r}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          {!active && onAccept && (
            <>
              <button onClick={onAccept}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-green-600 text-white text-base font-semibold hover:bg-green-700">
                <CheckCircle size={18} /> Aceptar
              </button>
              <button onClick={onReject}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-base font-semibold hover:bg-gray-50">
                <XCircle size={18} /> Rechazar
              </button>
            </>
          )}
          {active && (
            <>
              <Link href="/dashboard/appointments"
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-600 text-base font-semibold hover:bg-gray-50">
                <Calendar size={18} /> Ver citas
              </Link>
              <button onClick={() => router.push(`/dashboard/history/${m.patient_id}`)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-purple-200 text-purple-600 text-base font-semibold hover:bg-purple-50">
                <ClipboardList size={18} /> Historial clínico
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
