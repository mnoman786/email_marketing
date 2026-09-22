'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import toast from 'react-hot-toast'

export default function MailboxOAuthCallback() {
  const started = useRef(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const qc = useQueryClient()

  useEffect(() => {
    if (started.current) return
    started.current = true
    async function complete() {
      const params = new URLSearchParams(window.location.search)
      // Remove the authorization code from browser history immediately.
      window.history.replaceState(null, '', window.location.pathname)
      const state = params.get('state')
      const expected = sessionStorage.getItem('mailbox_oauth_state')
      sessionStorage.removeItem('mailbox_oauth_state')
      if (!state || !expected || state !== expected) {
        setError('This connection request is invalid or expired. Start again from Accounts in the same browser tab.')
        return
      }
      if (params.has('error')) {
        setError('Mailbox access was not granted. You can try connecting again from Accounts.')
        return
      }
      const code = params.get('code')
      if (!code) {
        setError('The provider did not return an authorization code. Please try again.')
        return
      }
      try {
        await smtpApi.oauthComplete(state, code)
        await qc.invalidateQueries({ queryKey: ['smtp-accounts'] })
        await qc.invalidateQueries({ queryKey: ['smtp-stats'] })
        toast.success('Mailbox connected. You can now test it or add it to a campaign.')
        router.replace('/accounts')
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        setError(detail || 'Could not connect the mailbox. Please try again from Accounts.')
      }
    }
    void complete()
  }, [qc, router])

  return (
    <div className="p-6 space-y-3 max-w-xl" role="status" aria-live="polite">
      <h1 className="text-2xl font-bold">{error ? 'Mailbox connection unsuccessful' : 'Connecting your mailbox…'}</h1>
      <p className="text-sm text-muted-foreground">{error || 'Finishing authorization with your email provider.'}</p>
      {error && <Link href="/accounts" className="text-primary underline">Return to Accounts</Link>}
    </div>
  )
}
