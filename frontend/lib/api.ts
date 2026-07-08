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
  verifyEmail: (token: string) => api.post('/api/auth/verify-email/', { token }),
  resendVerification: (email: string) => api.post('/api/auth/resend-verification/', { email }),
  logout: (refresh: string) => api.post('/api/auth/logout/', { refresh }),
  profile: () => api.get('/api/auth/profile/'),
  updateProfile: (data: any) => api.patch('/api/auth/profile/', data),
  changePassword: (data: any) => api.post('/api/auth/change-password/', data),
  sessions: () => api.get('/api/auth/sessions/'),
  revokeSession: (id: number) => api.post(`/api/auth/sessions/${id}/revoke/`),
  revokeOtherSessions: () => api.post('/api/auth/sessions/revoke-others/'),
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

// Tags
export const tagsApi = {
  getAll: () => api.get('/api/contacts/tags/'),
  create: (data: { name: string; color?: string }) => api.post('/api/contacts/tags/', data),
  update: (id: number, data: { name?: string; color?: string }) => api.patch(`/api/contacts/tags/${id}/`, data),
  delete: (id: number) => api.delete(`/api/contacts/tags/${id}/`),
  addContacts: (id: number, contact_ids: number[]) => api.post(`/api/contacts/tags/${id}/add-contacts/`, { contact_ids }),
  removeContacts: (id: number, contact_ids: number[]) => api.post(`/api/contacts/tags/${id}/remove-contacts/`, { contact_ids }),
}

// Contacts
export const contactsApi = {
  getAll: (params?: any) => api.get('/api/contacts/', { params }),
  stats: (params?: { list_id?: number }) => api.get('/api/contacts/stats/', { params }),
  get: (id: number) => api.get(`/api/contacts/${id}/`),
  create: (data: any) => api.post('/api/contacts/', data),
  update: (id: number, data: any) => api.patch(`/api/contacts/${id}/`, data),
  delete: (id: number) => api.delete(`/api/contacts/${id}/`),
  bulkImport: (data: any) => api.post('/api/contacts/bulk-import/', data),
  importStatus: (taskId: string) => api.get(`/api/contacts/import-status/${taskId}/`),
  bulkDelete: (ids: number[]) => api.post('/api/contacts/bulk-delete/', { ids }),
  verify: (id: number) => api.post(`/api/contacts/${id}/verify/`),
  verifyBulk: (data: { contact_ids?: number[]; list_id?: number }) =>
    api.post('/api/contacts/verify-bulk/', data),
  verifyStatus: (taskId: string) => api.get(`/api/contacts/verify-status/${taskId}/`),
  unsubscribe: (id: number) => api.post(`/api/contacts/${id}/unsubscribe/`),
  suppressions: (params?: any) => api.get('/api/contacts/suppressions/', { params }),
  addSuppressions: (emails: string[], note = '') => api.post('/api/contacts/suppressions/', { emails, note }),
  deleteSuppressions: (ids: number[]) => api.post('/api/contacts/suppressions/delete/', { ids }),
}

// Import validation (staging workspace)
export const validationApi = {
  createBatch: (data: { name?: string; contacts: any[] }) => api.post('/api/validation/batches/', data),
  batches: (params?: any) => api.get('/api/validation/batches/', { params }),
  getBatch: (id: number) => api.get(`/api/validation/batches/${id}/`),
  leads: (id: number, params?: any) => api.get(`/api/validation/batches/${id}/leads/`, { params }),
  promote: (id: number, data: { list_id?: number; lead_ids?: number[]; bucket?: string }) =>
    api.post(`/api/validation/batches/${id}/promote/`, data),
  deleteBatch: (id: number) => api.delete(`/api/validation/batches/${id}/`),
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
  getWarmup: (id: number) => api.get(`/api/smtp/${id}/warmup/`),
  updateWarmup: (id: number, data: any) => api.patch(`/api/smtp/${id}/warmup/`, data),
  deliverability: (id: number, dkimSelector?: string) =>
    api.get(`/api/smtp/${id}/deliverability/`, { params: dkimSelector ? { dkim_selector: dkimSelector } : undefined }),
}

// Campaigns
export const campaignsApi = {
  getAll: (params?: any) => api.get('/api/campaigns/', { params }),
  get: (id: number) => api.get(`/api/campaigns/${id}/`),
  create: (data: any) => api.post('/api/campaigns/', data),
  update: (id: number, data: any) => api.patch(`/api/campaigns/${id}/`, data),
  delete: (id: number) => api.delete(`/api/campaigns/${id}/`),
  activate: (id: number) => api.post(`/api/campaigns/${id}/activate/`),
  pause: (id: number) => api.post(`/api/campaigns/${id}/pause/`),
  resume: (id: number) => api.post(`/api/campaigns/${id}/resume/`),
  stats: (id: number) => api.get(`/api/campaigns/${id}/stats/`),
  enrollments: (id: number, params?: any) => api.get(`/api/campaigns/${id}/enrollments/`, { params }),
  getSteps: (id: number) => api.get(`/api/campaigns/${id}/steps/`),
  createStep: (id: number, data: any) => api.post(`/api/campaigns/${id}/steps/`, data),
  updateStep: (id: number, stepId: number, data: any) => api.patch(`/api/campaigns/${id}/steps/${stepId}/`, data),
  deleteStep: (id: number, stepId: number) => api.delete(`/api/campaigns/${id}/steps/${stepId}/`),
  createVariant: (id: number, stepId: number, data: any) =>
    api.post(`/api/campaigns/${id}/steps/${stepId}/variants/`, data),
  updateVariant: (id: number, stepId: number, variantId: number, data: any) =>
    api.patch(`/api/campaigns/${id}/steps/${stepId}/variants/${variantId}/`, data),
  deleteVariant: (id: number, stepId: number, variantId: number) =>
    api.delete(`/api/campaigns/${id}/steps/${stepId}/variants/${variantId}/`),
  getTransitions: (id: number, stepId: number) =>
    api.get(`/api/campaigns/${id}/steps/${stepId}/transitions/`),
  createTransition: (id: number, stepId: number, data: any) =>
    api.post(`/api/campaigns/${id}/steps/${stepId}/transitions/`, data),
  updateTransition: (id: number, stepId: number, transitionId: number, data: any) =>
    api.patch(`/api/campaigns/${id}/steps/${stepId}/transitions/${transitionId}/`, data),
  deleteTransition: (id: number, stepId: number, transitionId: number) =>
    api.delete(`/api/campaigns/${id}/steps/${stepId}/transitions/${transitionId}/`),
}

// Lead Finder (Apollo.io)
export const leadsApi = {
  search: (data: any) => api.post('/api/leads/search/', data),
  reveal: (person_id: string) => api.post('/api/leads/reveal/', { person_id }),
  import: (data: { people: any[]; list_id?: number | null }) => api.post('/api/leads/import/', data),
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
  followupDraft: (id: number) => api.get(`/api/inbox/threads/${id}/followup-draft/`),
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
  downloadAttachment: (id: number) => api.get(`/api/inbox/attachments/${id}/download/`, { responseType: 'blob' }),
}

// Analytics
export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard/'),
  logs: (params?: any) => api.get('/api/analytics/logs/', { params }),
  retryFailed: (data: any) => api.post('/api/analytics/logs/retry-failed/', data),
}

// Workflows (Instantly-style trigger -> condition -> action automation graphs)
export const workflowsApi = {
  getAll: () => api.get('/api/workflows/'),
  get: (id: number) => api.get(`/api/workflows/${id}/`),
  create: (data: { name: string }) => api.post('/api/workflows/', data),
  update: (id: number, data: any) => api.patch(`/api/workflows/${id}/`, data),
  delete: (id: number) => api.delete(`/api/workflows/${id}/`),
  toggle: (id: number) => api.post(`/api/workflows/${id}/toggle/`),
  saveGraph: (id: number, data: {
    nodes: { client_id: string; node_type: string; config: Record<string, any>; position_x: number; position_y: number }[]
    edges: { source_client_id: string; target_client_id: string; label?: string }[]
  }) => api.put(`/api/workflows/${id}/graph/`, data),
  runs: (id: number, params?: any) => api.get(`/api/workflows/${id}/runs/`, { params }),
}

// Custom tracking domains
export const trackingDomainsApi = {
  getAll: () => api.get('/api/analytics/tracking-domains/'),
  create: (domain: string) => api.post('/api/analytics/tracking-domains/', { domain }),
  verify: (id: number) => api.post(`/api/analytics/tracking-domains/${id}/verify/`),
  setPrimary: (id: number) => api.post(`/api/analytics/tracking-domains/${id}/primary/`),
  delete: (id: number) => api.delete(`/api/analytics/tracking-domains/${id}/`),
}
