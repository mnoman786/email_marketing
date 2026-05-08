import axios, { AxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        if (!refresh) throw new Error('No refresh token')
        const res = await axios.post(`${API_URL}/api/token/refresh/`, { refresh })
        localStorage.setItem('access_token', res.data.access)
        original.headers.Authorization = `Bearer ${res.data.access}`
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const authApi = {
  register: (data: any) => api.post('/api/auth/register/', data),
  login: (data: any) => api.post('/api/auth/login/', data),
  logout: (refresh: string) => api.post('/api/auth/logout/', { refresh }),
  profile: () => api.get('/api/auth/profile/'),
  updateProfile: (data: any) => api.patch('/api/auth/profile/', data),
  changePassword: (data: any) => api.post('/api/auth/change-password/', data),
}

// Contact Lists
export const listsApi = {
  getAll: (params?: any) => api.get('/api/contacts/lists/', { params }),
  get: (id: number) => api.get(`/api/contacts/lists/${id}/`),
  create: (data: any) => api.post('/api/contacts/lists/', data),
  update: (id: number, data: any) => api.patch(`/api/contacts/lists/${id}/`, data),
  delete: (id: number) => api.delete(`/api/contacts/lists/${id}/`),
  getContacts: (id: number, params?: any) => api.get(`/api/contacts/lists/${id}/contacts/`, { params }),
}

// Contacts
export const contactsApi = {
  getAll: (params?: any) => api.get('/api/contacts/', { params }),
  get: (id: number) => api.get(`/api/contacts/${id}/`),
  create: (data: any) => api.post('/api/contacts/', data),
  update: (id: number, data: any) => api.patch(`/api/contacts/${id}/`, data),
  delete: (id: number) => api.delete(`/api/contacts/${id}/`),
  bulkImport: (data: any) => api.post('/api/contacts/bulk_import/', data),
  bulkDelete: (ids: number[]) => api.post('/api/contacts/bulk_delete/', { ids }),
  unsubscribe: (id: number) => api.post(`/api/contacts/${id}/unsubscribe/`),
}

// Templates
export const templatesApi = {
  getAll: (params?: any) => api.get('/api/templates/', { params }),
  get: (id: number) => api.get(`/api/templates/${id}/`),
  create: (data: any) => api.post('/api/templates/', data),
  update: (id: number, data: any) => api.patch(`/api/templates/${id}/`, data),
  delete: (id: number) => api.delete(`/api/templates/${id}/`),
  preview: (id: number, variables?: any) => api.post(`/api/templates/${id}/preview/`, { variables }),
  duplicate: (id: number) => api.post(`/api/templates/${id}/duplicate/`),
}

// SMTP Accounts
export const smtpApi = {
  getAll: (params?: any) => api.get('/api/smtp/', { params }),
  get: (id: number) => api.get(`/api/smtp/${id}/`),
  create: (data: any) => api.post('/api/smtp/', data),
  update: (id: number, data: any) => api.patch(`/api/smtp/${id}/`, data),
  delete: (id: number) => api.delete(`/api/smtp/${id}/`),
  test: (id: number, testEmail: string) => api.post(`/api/smtp/${id}/test/`, { test_email: testEmail }),
  stats: () => api.get('/api/smtp/stats/'),
}

// Campaigns
export const campaignsApi = {
  getAll: (params?: any) => api.get('/api/campaigns/', { params }),
  get: (id: number) => api.get(`/api/campaigns/${id}/`),
  create: (data: any) => api.post('/api/campaigns/', data),
  update: (id: number, data: any) => api.patch(`/api/campaigns/${id}/`, data),
  delete: (id: number) => api.delete(`/api/campaigns/${id}/`),
  send: (id: number, data?: any) => api.post(`/api/campaigns/${id}/send/`, data || {}),
  pause: (id: number) => api.post(`/api/campaigns/${id}/pause/`),
  cancel: (id: number) => api.post(`/api/campaigns/${id}/cancel/`),
  duplicate: (id: number) => api.post(`/api/campaigns/${id}/duplicate/`),
  stats: (id: number) => api.get(`/api/campaigns/${id}/stats/`),
  smtpRoutes: (id: number) => api.get(`/api/campaigns/${id}/smtp_routes/`),
  updateSmtpRoutes: (id: number, data: any) => api.post(`/api/campaigns/${id}/smtp_routes/`, data),
}

// Analytics
export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard/'),
  logs: (params?: any) => api.get('/api/analytics/logs/', { params }),
  retryFailed: (data: any) => api.post('/api/analytics/logs/retry_failed/', data),
}
