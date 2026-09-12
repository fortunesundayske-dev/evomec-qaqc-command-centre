import { qaqcApi, type LocalUser } from '@/lib/qaqc-api'

const sessionKey = 'evomec_qaqc_session'
const userKey = 'evomec_qaqc_user'
const authEvent = 'evomec-auth-change'

export const localAuth = {
  getToken: () => localStorage.getItem(sessionKey),
  getUser: (): LocalUser | null => {
    const value = localStorage.getItem(userKey)
    return value ? JSON.parse(value) as LocalUser : null
  },
  async signIn(email: string, password: string) {
    const result = await qaqcApi.auth.login(email, password)
    localStorage.setItem(sessionKey, result.token)
    localStorage.setItem(userKey, JSON.stringify(result.user))
    window.dispatchEvent(new Event(authEvent))
    return result.user
  },
  async requestAccess(email: string, password: string, displayName: string) {
    return qaqcApi.auth.requestAccess(email, password, displayName)
  },
  async requestPasswordReset(email: string) {
    return qaqcApi.auth.requestReset(email)
  },
  async signOut() {
    const token = localStorage.getItem(sessionKey)
    if (token) await qaqcApi.auth.logout(token).catch(() => undefined)
    localStorage.removeItem(sessionKey)
    localStorage.removeItem(userKey)
    window.dispatchEvent(new Event(authEvent))
  },
  subscribe(callback: () => void) {
    window.addEventListener(authEvent, callback)
    return () => window.removeEventListener(authEvent, callback)
  },
}
