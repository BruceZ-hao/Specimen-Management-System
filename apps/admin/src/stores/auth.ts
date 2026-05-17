import { defineStore } from 'pinia'

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('admin-user') || 'null') as null | Record<string, unknown>
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('admin-token') || '',
    user: readStoredUser(),
  }),
  getters: {
    isViewer: (state) => state.user?.role === 'viewer',
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    setSession(token: string, user: Record<string, unknown>) {
      this.token = token
      this.user = user
      localStorage.setItem('admin-token', token)
      localStorage.setItem('admin-user', JSON.stringify(user))
    },
    async refreshUser() {
      if (!this.token) return
      const { getMe } = await import('@/api/auth')
      const { data } = await getMe()
      this.user = data
      localStorage.setItem('admin-user', JSON.stringify(data))
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('admin-token')
      localStorage.removeItem('admin-user')
    },
  },
})
