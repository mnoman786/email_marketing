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
  const [menuOpen, setMenuOpen] = useState(false)

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
        <div className="hidden lg:block"><Sidebar /></div>
        {menuOpen && <div className="fixed inset-0 z-40 lg:hidden"><button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} /><div className="relative w-fit shadow-2xl"><Sidebar mobile onNavigate={() => setMenuOpen(false)} /></div></div>}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar onMenuClick={() => setMenuOpen(true)} />
          <main className="app-main flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
