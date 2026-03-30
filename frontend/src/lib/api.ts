import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('brainmind_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('brainmind_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  register: (data: { email: string; password: string; role: string; full_name: string }) =>
    api.post('/auth/register', data),
  login: (email: string, password: string) => {
    const form = new FormData()
    form.append('username', email)
    form.append('password', password)
    return api.post('/auth/login', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  me: () => api.get('/auth/me'),
  resendVerification: () => api.post('/auth/resend-verification'),
}

export const profilesApi = {
  getPsychologistMe: () => api.get('/profiles/psychologist/me'),
  updatePsychologist: (data: any) => api.put('/profiles/psychologist/me', data),
  getPatientMe: () => api.get('/profiles/patient/me'),
  updatePatient: (data: any) => api.put('/profiles/patient/me', data),
  listPsychologists: (params?: any) => api.get('/profiles/psychologists', { params }),
  getPsychologist: (id: string) => api.get(`/profiles/psychologist/${id}`),
}

export const matchesApi = {
  generate: () => api.post('/matches/generate'),
  getMyMatches: () => api.get('/matches/my'),
  updateStatus: (matchId: string, status: 'accepted' | 'rejected') =>
    api.patch(`/matches/${matchId}/status`, { status }),
}

export const appointmentsApi = {
  create: (data: { match_id: string; scheduled_at: string; duration_min?: number }) =>
    api.post('/appointments/', data),
  getMyAppointments: (status?: string) =>
    api.get('/appointments/my', { params: status ? { status } : {} }),
  getAppointment: (id: string) => api.get(`/appointments/${id}`),
  confirm: (id: string) => api.patch(`/appointments/${id}/confirm`),
  cancel: (id: string, reason?: string) =>
    api.patch(`/appointments/${id}/cancel`, null, { params: reason ? { reason } : {} }),
  addNotes: (id: string, notes: string) =>
    api.patch(`/appointments/${id}/notes`, null, { params: { notes } }),
}

export const paymentsApi = {
  createIntent: (appointment_id: string) =>
    api.post('/payments/create-intent', { appointment_id }),
  stripeOnboard: () => api.post('/payments/stripe-onboard'),
}

// --- IA clínica (Iteración 2) ---
export const aiApi = {
  uploadAudio: (appointmentId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/ai/sessions/${appointmentId}/upload-audio`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getTranscript: (appointmentId: string) =>
    api.get(`/ai/sessions/${appointmentId}/transcript`),
  generateSoap: (appointmentId: string) =>
    api.post(`/ai/sessions/${appointmentId}/generate-soap`),
  getSummary: (appointmentId: string) =>
    api.get(`/ai/sessions/${appointmentId}/summary`),
  generateExercisePlan: (appointmentId: string) =>
    api.post(`/ai/sessions/${appointmentId}/exercise-plan`),
  getExercisePlan: (appointmentId: string) =>
    api.get(`/ai/sessions/${appointmentId}/exercise-plan`),
  acknowledgeExercisePlan: (planId: string) =>
    api.patch(`/ai/exercise-plans/${planId}/acknowledge`, { acknowledged: true }),
  getPatientHistory: (patientId: string) =>
    api.get(`/ai/patients/${patientId}/history`),
}

// --- Notificaciones (Iteración 3) ---
export const notificationsApi = {
  getAll: () => api.get('/notifications/'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAllRead: () => api.patch('/notifications/read-all'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
}

// --- Video (Iteración 3) ---
export const videoApi = {
  complete: (appointmentId: string) =>
    api.patch(`/appointments/${appointmentId}/complete`),
}

// --- Verificación de email (Iteración 4) ---
export const verifyEmailApi = {
  verify: (token: string) => api.get(`/auth/verify-email?token=${token}`),
  resend: () => api.post('/auth/resend-verification'),
}

// --- Analytics (Iteración 4) ---
export const analyticsApi = {
  myProgress: () => api.get('/analytics/my-progress'),
  patientAnalytics: (patientId: string) => api.get(`/analytics/patients/${patientId}`),
}

// --- RGPD (Iteración 4) ---
export const rgpdApi = {
  requestExport: () => api.post('/rgpd/my-data'),
  getRequests: () => api.get('/rgpd/requests'),
  deleteAccount: () => api.delete('/rgpd/delete-account'),
}

// ── Iteración 6 ──────────────────────────────────────────────────────────────

export const chatApi = {
  getConversations: () => api.get('/chat/conversations'),
  getMessages:      (matchId: string, limit = 50) =>
    api.get(`/chat/${matchId}/messages`, { params: { limit } }),
  sendMessage:      (matchId: string, content: string) =>
    api.post(`/chat/${matchId}/messages`, { content }),
}

export const reviewsApi = {
  create:             (data: { appointment_id: string; rating: number; comment?: string; is_anonymous?: boolean }) =>
    api.post('/reviews/', data),
  getByPsychologist:  (id: string) => api.get(`/reviews/psychologist/${id}`),
  getByAppointment:   (appointmentId: string) => api.get(`/reviews/appointment/${appointmentId}`),
  getPending:         () => api.get('/reviews/my-pending'),
}

export const subscriptionApi = {
  getPlans:       () => api.get('/subscription/plans'),
  getStatus:      () => api.get('/subscription/status'),
  createCheckout: (plan: string) =>
    api.post('/subscription/create-checkout', null, { params: { plan } }),
  cancel:         () => api.post('/subscription/cancel'),
}

export const pushApi = {
  getVapidKey: () => api.get('/push/vapid-public-key'),
  subscribe:   (data: { endpoint: string; p256dh: string; auth: string; user_agent?: string }) =>
    api.post('/push/subscribe', data),
  unsubscribe: (endpoint: string) =>
    api.delete('/push/unsubscribe', { params: { endpoint } }),
}
