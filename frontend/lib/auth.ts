import { User } from './types'

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token')
  if (token && !sessionStorage.getItem('access_token')) sessionStorage.setItem('access_token', token)
  localStorage.removeItem('access_token')
  return token
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  const token = sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token')
  if (token && !sessionStorage.getItem('refresh_token')) sessionStorage.setItem('refresh_token', token)
  localStorage.removeItem('refresh_token')
  return token
}

export function setTokens(access: string, refresh: string) {
  sessionStorage.setItem('access_token', access)
  localStorage.removeItem('access_token')
  sessionStorage.setItem('refresh_token', refresh)
  localStorage.removeItem('refresh_token')
}

export function clearTokens() {
  sessionStorage.removeItem('access_token')
  localStorage.removeItem('access_token')
  sessionStorage.removeItem('refresh_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null
  const u = localStorage.getItem('user')
  if (!u) return null
  try {
    const user = JSON.parse(u) as User & { apollo_api_key?: string }
    if ('apollo_api_key' in user) {
      delete user.apollo_api_key
      localStorage.setItem('user', JSON.stringify(user))
    }
    return user
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

export function setUser(user: User) {
  localStorage.setItem('user', JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

let pendingTabRestore: Promise<boolean> | null = null

/** Share the current session with a newly opened tab on the same origin. */
export function restoreAuthFromOtherTab(): Promise<boolean> {
  if (isAuthenticated()) return Promise.resolve(true)
  if (pendingTabRestore) return pendingTabRestore
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false)

  pendingTabRestore = new Promise<boolean>(resolve => {
    const channel = new BroadcastChannel('mailflow-auth')
    const requestId = crypto.randomUUID()
    let finished = false
    const finish = (restored: boolean) => {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      channel.close()
      resolve(restored)
    }
    channel.onmessage = event => {
      const message = event.data
      if (message?.type !== 'session-response' || message.requestId !== requestId) return
      if (typeof message.access !== 'string' || typeof message.refresh !== 'string') return
      setTokens(message.access, message.refresh)
      finish(true)
    }
    const timer = window.setTimeout(() => finish(false), 1500)
    channel.postMessage({ type: 'session-request', requestId })
  }).finally(() => { pendingTabRestore = null })
  return pendingTabRestore
}

export function broadcastLogout() {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel('mailflow-auth')
  channel.postMessage({ type: 'logout' })
  channel.close()
}
