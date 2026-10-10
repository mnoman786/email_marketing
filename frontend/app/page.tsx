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
  return null
}
