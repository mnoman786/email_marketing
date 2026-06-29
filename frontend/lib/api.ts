import axios, { AxiosError } from 'axios'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
        const res = await axios.post(`${API_URL}/api/auth/token/refresh/`, { refresh })
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
  bulkImport: (data: any) => api.post('/api/contacts/bulk-import/', data),
  importStatus: (taskId: string) => api.get(`/api/contacts/import-status/${taskId}/`),
  bulkDelete: (ids: number[]) => api.post('/api/contacts/bulk-delete/', { ids }),
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
  testImap: (id: number, data?: any) => api.post(`/api/smtp/${id}/test-imap/`, data || {}),
  testImapUnsaved: (data: any) => api.post('/api/smtp/test-imap/', data),
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
  reset: (id: number) => api.post(`/api/campaigns/${id}/reset/`),
  duplicate: (id: number) => api.post(`/api/campaigns/${id}/duplicate/`),
  stats: (id: number) => api.get(`/api/campaigns/${id}/stats/`),
  smtpRoutes: (id: number) => api.get(`/api/campaigns/${id}/smtp-routes/`),
  updateSmtpRoutes: (id: number, data: any) => api.post(`/api/campaigns/${id}/smtp-routes/`, data),
}

// Sequences
export const sequencesApi = {
  getAll: (params?: any) => api.get('/api/sequences/', { params }),
  get: (id: number) => api.get(`/api/sequences/${id}/`),
  create: (data: any) => api.post('/api/sequences/', data),
  update: (id: number, data: any) => api.patch(`/api/sequences/${id}/`, data),
  delete: (id: number) => api.delete(`/api/sequences/${id}/`),
  activate: (id: number) => api.post(`/api/sequences/${id}/activate/`),
  pause: (id: number) => api.post(`/api/sequences/${id}/pause/`),
  resume: (id: number) => api.post(`/api/sequences/${id}/resume/`),
  stats: (id: number) => api.get(`/api/sequences/${id}/stats/`),
  smtpRoutes: (id: number) => api.get(`/api/sequences/${id}/smtp-routes/`),
  updateSmtpRoutes: (id: number, data: any) => api.post(`/api/sequences/${id}/smtp-routes/`, data),
  enrollments: (id: number, params?: any) => api.get(`/api/sequences/${id}/enrollments/`, { params }),
  getSteps: (id: number) => api.get(`/api/sequences/${id}/steps/`),
  createStep: (id: number, data: any) => api.post(`/api/sequences/${id}/steps/`, data),
  updateStep: (id: number, stepId: number, data: any) => api.patch(`/api/sequences/${id}/steps/${stepId}/`, data),
  deleteStep: (id: number, stepId: number) => api.delete(`/api/sequences/${id}/steps/${stepId}/`),
}

// Inbox
function replyFormData(data: { html_content: string; text_content?: string; include_signature?: boolean; files?: File[] }) {
  const form = new FormData()
  form.append('html_content', data.html_content)
  form.append('text_content', data.text_content || '')
  form.append('include_signature', String(data.include_signature ?? true))
  ;(data.files || []).forEach(f => form.append('files', f))
  return form
}

export const inboxApi = {
  threads: (params?: any) => api.get('/api/inbox/threads/', { params }),
  getThread: (id: number) => api.get(`/api/inbox/threads/${id}/`),
  reply: (id: number, data: { html_content: string; text_content?: string; include_signature?: boolean; files?: File[] }) =>
    api.post(`/api/inbox/threads/${id}/reply/`, replyFormData(data), { headers: { 'Content-Type': undefined } }),
  setStatus: (id: number, lead_status: string) =>
    api.patch(`/api/inbox/threads/${id}/status/`, { lead_status }),
  setRead: (id: number, is_unread: boolean) =>
    api.patch(`/api/inbox/threads/${id}/read/`, { is_unread }),
  setArchived: (id: number, is_archived: boolean) =>
    api.patch(`/api/inbox/threads/${id}/archive/`, { is_archived }),
  setSnooze: (id: number, snoozed_until: string | null) =>
    api.patch(`/api/inbox/threads/${id}/snooze/`, { snoozed_until }),
  bulkAction: (ids: number[], action: string, lead_status?: string) =>
    api.post('/api/inbox/threads/bulk/', { ids, action, lead_status }),
  contactStats: (id: number) => api.get(`/api/inbox/threads/${id}/contact-stats/`),
  compose: (data: {
    contact_id: number; smtp_account_id: number; subject: string
    html_content: string; text_content?: string; include_signature?: boolean; files?: File[]
  }) => {
    const form = new FormData()
    form.append('contact_id', String(data.contact_id))
    form.append('smtp_account_id', String(data.smtp_account_id))
    form.append('subject', data.subject)
    form.append('html_content', data.html_content)
    form.append('text_content', data.text_content || '')
    form.append('include_signature', String(data.include_signature ?? true))
    ;(data.files || []).forEach(f => form.append('files', f))
    return api.post('/api/inbox/compose/', form, { headers: { 'Content-Type': undefined } })
  },
  templates: () => api.get('/api/inbox/templates/'),
  createTemplate: (data: { name: string; body_html?: string; body_text?: string }) =>
    api.post('/api/inbox/templates/', data),
  deleteTemplate: (id: number) => api.delete(`/api/inbox/templates/${id}/`),
  unreadCount: () => api.get('/api/inbox/unread-count/'),
}

// Analytics
export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard/'),
  logs: (params?: any) => api.get('/api/analytics/logs/', { params }),
  retryFailed: (data: any) => api.post('/api/analytics/logs/retry-failed/', data),
}
