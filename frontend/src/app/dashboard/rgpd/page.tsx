'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Shield, Download, Trash2, Clock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'

export default function RgpdPage() {
  const qc = useQueryClient()
  const logout = useAuthStore(s => s.logout)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['rgpd-requests'],
    queryFn: () => api.get('/rgpd/requests').then(r => r.data),
  })

  const requestExport = useMutation({
    mutationFn: () => api.post('/rgpd/my-data'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rgpd-requests'] }),
  })

  const deleteAccount = useMutation({
    mutationFn: () => api.delete('/rgpd/delete-account'),
    onSuccess: () => {
      setTimeout(() => {
        logout()
        window.location.href = '/'
      }, 2000)
    },
  })

  const hasPendingExport = requests.some((r: any) =>
    r.type === 'export' && ['pending', 'processing'].includes(r.status)
  )

  const STATUS_STYLE: Record<string, string> = {
    pending:    'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    completed:  'bg-green-100 text-green-700',
    rejected:   'bg-red-100 text-red-700',
  }
  const STATUS_LABEL: Record<string, string> = {
    pending: 'Pendiente', processing: 'Procesando',
    completed: 'Completado', rejected: 'Rechazado',
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'var(--font-serif)' }}>
          Privacidad y RGPD
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Gestiona tus derechos de acceso, portabilidad y olvido
        </p>
      </div>

      {/* Info RGPD */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 flex gap-4">
        <Shield size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800 mb-1">Tus derechos bajo el RGPD</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Tienes derecho a acceder a tus datos (Art. 15), portarlos (Art. 20)
            y solicitar su eliminación (Art. 17). Tus datos clínicos se almacenan
            en nuestros servidores y nunca se comparten sin tu consentimiento explícito.
          </p>
        </div>
      </div>

      {/* Export de datos */}
      <div className="card p-6 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-900">Exportar mis datos</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Descarga todos tus datos en formato JSON (Art. 20 RGPD)
            </p>
          </div>
          <Download size={20} className="text-gray-400 flex-shrink-0" />
        </div>
        <ul className="text-xs text-gray-500 space-y-1 mb-4 ml-1">
          <li>· Perfil y configuración</li>
          <li>· Historial de citas</li>
          <li>· Planes de ejercicios asignados</li>
          <li>· Consentimientos y preferencias</li>
        </ul>
        <button
          onClick={() => requestExport.mutate()}
          disabled={requestExport.isPending || hasPendingExport}
          className="btn-primary flex items-center gap-2">
          {requestExport.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Solicitando...</>
          ) : hasPendingExport ? (
            <><Clock size={14} /> Export en proceso</>
          ) : (
            <><Download size={14} /> Solicitar mis datos</>
          )}
        </button>
        {requestExport.isSuccess && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <CheckCircle size={12} /> Recibirás un email cuando esté listo
          </p>
        )}
      </div>

      {/* Historial de solicitudes */}
      {requests.length > 0 && (
        <div className="card p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Solicitudes anteriores</h2>
          <div className="space-y-3">
            {requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {r.type === 'export' ? 'Export de datos' : 'Eliminación de cuenta'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(r.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.export_url && r.status === 'completed' && (
                    <a href={r.export_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                      <Download size={12} /> Descargar
                    </a>
                  )}
                  <span className={`badge text-xs ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eliminación de cuenta */}
      <div className="card p-6 border border-red-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-semibold text-red-700">Eliminar mi cuenta</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Borrado permanente de todos tus datos (Art. 17 RGPD)
            </p>
          </div>
          <Trash2 size={20} className="text-red-400 flex-shrink-0" />
        </div>

        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
          <div className="flex gap-2">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 leading-relaxed">
              Esta acción es <strong>irreversible</strong>. Se eliminarán tu perfil,
              historial de sesiones, resúmenes IA y vectores de embeddings.
              Recibirás un email de confirmación.
            </p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">
            Solicitar eliminación de cuenta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Escribe <strong>ELIMINAR</strong> para confirmar:
            </p>
            <input
              type="text"
              className="input border-red-200 focus:border-red-400"
              placeholder="ELIMINAR"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="btn-secondary flex-1 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => deleteAccount.mutate()}
                disabled={deleteConfirmText !== 'ELIMINAR' || deleteAccount.isPending}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {deleteAccount.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Eliminando...</>
                ) : (
                  <><Trash2 size={14} /> Confirmar eliminación</>
                )}
              </button>
            </div>
            {deleteAccount.isSuccess && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle size={12} /> Cuenta eliminada. Cerrando sesión...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
