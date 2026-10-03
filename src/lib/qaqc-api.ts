export type QaqcValue = string | number | boolean | null
export type QaqcRecord = Record<string, QaqcValue>

export type LocalUser = {
  id: string
  email: string
  displayName: string
  discipline?: string
  role: string
  status: string
  profilePhoto?: Record<string, QaqcValue> | null
  profilePhotoUrl?: string
}

export type QaqcModuleStats = {
  total: number
  open: number
  closed: number
  overdue: number
  dueSoon: number
  sheets: string[]
}

export type QaqcSummary = {
  workbook: string
  updatedAt: string | null
  sheets: string[]
  datasets: Array<{ name: string; records: number }>
  project: string
  projects: string[]
  modules: Record<string, QaqcModuleStats>
  itrTrend: Array<{ key: string; month: string; raised: number; closed: number; open: number }>
  ncrTrend: Array<{ key: string; month: string; raised: number; closed: number; open: number }>
  projectPerformance: Array<{ project: string; itrCompletion: string; ncrStatus: string; audit: string; documentation: string; score: string }>
}

// An empty value intentionally uses same-origin requests. This works with the Vite
// development proxy and with a reverse proxy in production; set VITE_QAQC_API_URL
// only when the API is hosted on a different origin.
const apiBaseUrl = (import.meta.env.VITE_QAQC_API_URL || '').replace(/\/$/, '')

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('evomec_qaqc_session')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `QA/QC API request failed (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export const qaqcApi = {
  auth: {
    login: (email: string, password: string) => request<{ token: string; user: LocalUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    requestAccess: (email: string, password: string, displayName: string) => request<{ message: string }>('/api/auth/request-access', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
    requestReset: (email: string) => request<{ message: string }>('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
    logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  },
  summary: (project = 'All Projects') => request<QaqcSummary>(`/api/summary?project=${encodeURIComponent(project)}`),
  records: (module: string, project = 'All Projects') => request<QaqcRecord[]>(`/api/records?module=${encodeURIComponent(module)}&project=${encodeURIComponent(project)}`),
  updateRecordDate: (sheetName: string, rowNumber: number, field: string, value: string) => request<{ ok: true; record: { sheetName: string; rowNumber: number; field: string; value: string } }>(`/api/records/${encodeURIComponent(sheetName)}/${rowNumber}/date`, { method: 'PATCH', body: JSON.stringify({ field, value }) }),
  projects: () => request<string[]>('/api/projects'),
  standards: (query = '') => request<QaqcRecord[]>(`/api/standards?query=${encodeURIComponent(query)}`),
  adminUsers: () => request<QaqcRecord[]>('/api/admin/users'),
  updateAdminUser: (username: string, updates: { role: string; status: string }) => request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  profile: () => request<LocalUser>('/api/profile'),
  updateProfile: (displayName: string, discipline: string) => request<LocalUser>('/api/profile', { method: 'PATCH', body: JSON.stringify({ displayName, discipline }) }),
  uploadProfilePhoto: async (file: File) => {
    const body = new FormData()
    body.append('photo', file)
    return request<{ profilePhoto: LocalUser['profilePhoto']; profilePhotoUrl?: string }>('/api/profile/photo', { method: 'POST', body })
  },
  activity: () => request<QaqcRecord[]>('/api/admin/activity'),
  supportTickets: () => request<QaqcRecord[]>('/api/support/tickets'),
  adminSupportTickets: () => request<QaqcRecord[]>('/api/admin/support-tickets'),
  createSupportTicket: (ticket: { subject: string; category: string; message: string }) => request<QaqcRecord>('/api/support/tickets', { method: 'POST', body: JSON.stringify(ticket) }),
}
