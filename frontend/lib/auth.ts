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
