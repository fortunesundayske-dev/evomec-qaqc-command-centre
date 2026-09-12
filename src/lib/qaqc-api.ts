export type QaqcRecord = Record<string, string | number | boolean | null>

import { blink } from '@/blink/client'

const apiBaseUrl = (import.meta.env.VITE_QAQC_API_URL || '').replace(/\/$/, '')

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error('QA/QC API is not configured. Set VITE_QAQC_API_URL.')
  const token = await blink.auth.getValidToken()
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  })
  if (!response.ok) throw new Error(`QA/QC API request failed (${response.status}).`)
  return response.json() as Promise<T>
}

export const qaqcApi = {
  records: (module: string, project?: string) => request<QaqcRecord[]>(`/api/records?module=${encodeURIComponent(module)}&project=${encodeURIComponent(project || 'All Projects')}`),
  projects: () => request<string[]>('/api/projects'),
  standards: (query = '') => request<QaqcRecord[]>(`/api/standards?query=${encodeURIComponent(query)}`),
  adminUsers: () => request<QaqcRecord[]>('/api/admin/users'),
  activity: () => request<QaqcRecord[]>('/api/admin/activity'),
  cloudinaryAssetUrl: (assetId: string) => request<{ url: string }>(`/api/assets/${encodeURIComponent(assetId)}`),
}