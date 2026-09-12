export type QaqcRecord = Record<string, string | number | boolean | null>
export type LocalUser = { id: string; email: string; displayName: string; role: string; status: string }

const apiBaseUrl = (import.meta.env.VITE_QAQC_API_URL || '').replace(/\/$/, '')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error('QA/QC API is not configured. Set VITE_QAQC_API_URL.')
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('evomec_qaqc_session')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  })
  if (!response.ok) throw new Error(`QA/QC API request failed (${response.status}).`)
  return response.json() as Promise<T>
}

export const qaqcApi = {
  auth: {
    login: (email: string, password: string) => request<{ token: string; user: LocalUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    requestAccess: (email: string, password: string, displayName: string) => request<{ message: string }>('/api/auth/request-access', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
    requestReset: (email: string) => request<{ message: string }>('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
    logout: (token: string) => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
  },
  records: (module: string, project?: string) => request<QaqcRecord[]>(`/api/records?module=${encodeURIComponent(module)}&project=${encodeURIComponent(project || 'All Projects')}`),
  projects: () => request<string[]>('/api/projects'),
  standards: (query = '') => request<QaqcRecord[]>(`/api/standards?query=${encodeURIComponent(query)}`),
  adminUsers: () => request<QaqcRecord[]>('/api/admin/users'),
  activity: () => request<QaqcRecord[]>('/api/admin/activity'),
  supportTickets: () => request<QaqcRecord[]>('/api/support/tickets'),
  adminSupportTickets: () => request<QaqcRecord[]>('/api/admin/support-tickets'),
  createSupportTicket: (ticket: { subject: string; category: string; message: string }) => request<QaqcRecord>('/api/support/tickets', { method: 'POST', body: JSON.stringify(ticket) }),
  cloudinaryAssetUrl: (assetId: string) => request<{ url: string }>(`/api/assets/${encodeURIComponent(assetId)}`),
}