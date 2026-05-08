'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User } from '@/lib/types'
import { authApi } from '@/lib/api'
import { setTokens, clearTokens, setUser, getUser, isAuthenticated, getRefreshToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: any) => Promise<void>
  logout: () => Promise<void>
  updateUser: (data: any) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated()) {
      const cached = getUser()
      if (cached) setUserState(cached)
      authApi.profile()
        .then(res => {
          setUserState(res.data)
          setUser(res.data)
        })
        .catch(() => {
          clearTokens()
          setUserState(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password })
    setTokens(res.data.access, res.data.refresh)
    setUser(res.data.user)
    setUserState(res.data.user)
  }

  const register = async (data: any) => {
    const res = await authApi.register(data)
    setTokens(res.data.access, res.data.refresh)
    setUser(res.data.user)
    setUserState(res.data.user)
  }

  const logout = async () => {
    try {
      const refresh = getRefreshToken()
      if (refresh) await authApi.logout(refresh)
    } catch {}
    clearTokens()
    setUserState(null)
    router.push('/login')
  }

  const updateUser = async (data: any) => {
    const res = await authApi.updateProfile(data)
    setUser(res.data)
    setUserState(res.data)
    toast.success('Profile updated')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
