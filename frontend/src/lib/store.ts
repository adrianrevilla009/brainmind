import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  role: 'psychologist' | 'patient' | null
  userId: string | null
  isAuthenticated: boolean
  setAuth: (token: string, role: string, userId: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      userId: null,
      isAuthenticated: false,
      setAuth: (token, role, userId) => {
        localStorage.setItem('brainmind_token', token)
        set({ token, role: role as any, userId, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('brainmind_token')
        set({ token: null, role: null, userId: null, isAuthenticated: false })
        window.location.href = '/login'
      },
    }),
    { name: 'brainmind-auth', partialize: (s) => ({ token: s.token, role: s.role, userId: s.userId, isAuthenticated: s.isAuthenticated }) }
  )
)
