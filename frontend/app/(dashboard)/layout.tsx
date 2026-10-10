'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { restoreAuthFromOtherTab } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { AuthProvider } from '@/components/providers/auth-provider'
import { useState } from 'react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    restoreAuthFromOtherTab().then(authenticated => {
      if (!active) return
      if (authenticated) setReady(true)
      else router.replace('/login')
    })
    return () => { active = false }
  }, [router])

  if (!ready) return null

  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
