'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { restoreAuthFromOtherTab } from '@/lib/auth'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    restoreAuthFromOtherTab().then(authenticated => {
      router.replace(authenticated ? '/dashboard' : '/login')
    })
  }, [router])
  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
      Opening MailFlow… <a href="/login" className="ml-1 text-primary underline">Go to sign in</a>
    </main>
  )
}
