import { qaqcApi, type LocalUser } from '@/lib/qaqc-api'

const sessionKey = 'evomec_qaqc_session'
const userKey = 'evomec_qaqc_user'
const authEvent = 'evomec-auth-change'

function storeUser(user: LocalUser) {
  localStorage.setItem(userKey, JSON.stringify(user))
  window.dispatchEvent(new Event(authEvent))
}

export const localAuth = {
  getToken: () => typeof window === 'undefined' ? null : localStorage.getItem(sessionKey),
  getUser: (): LocalUser | null => {
    if (typeof window === 'undefined') return null
    const value = localStorage.getItem(userKey)
    return value ? JSON.parse(value) as LocalUser : null
  },
  async signIn(email: string, password: string) {
    const result = await qaqcApi.auth.login(email, password)
    localStorage.setItem(sessionKey, result.token)
    storeUser(result.user)
    return result.user
  },
  setUser(user: LocalUser) {
    storeUser(user)
  },
  async requestAccess(email: string, password: string, displayName: string) {
    return qaqcApi.auth.requestAccess(email, password, displayName)
  },
  async requestPasswordReset(email: string) {
    return qaqcApi.auth.requestReset(email)
  },
  async signOut() {
    if (localStorage.getItem(sessionKey)) await qaqcApi.auth.logout().catch(() => undefined)
    localStorage.removeItem(sessionKey)
    localStorage.removeItem(userKey)
    window.dispatchEvent(new Event(authEvent))
  },
  subscribe(callback: () => void) {
    window.addEventListener(authEvent, callback)
    return () => window.removeEventListener(authEvent, callback)
  },
}
