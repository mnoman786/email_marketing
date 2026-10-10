'use client'

import { useEffect, useRef, useState } from 'react'
import { smtpApi } from '@/lib/api'

export default function MailboxOAuthCallback() {
  const started = useRef(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)

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
      sessionStorage.removeItem('mailbox_oauth_popup')
      if (!state || !expected || state !== expected) {
        setError('This connection request is invalid or expired. Close this window and try again.')
        return
      }
      if (params.has('error')) {
        setError('Mailbox access was not granted. Close this window and try again.')
        return
      }
      const code = params.get('code')
      if (!code) {
        setError('The provider did not return an authorization code. Close this window and try again.')
        return
      }
      try {
        const response = await smtpApi.oauthComplete(state, code)
        const message = { type: 'mailbox-oauth-complete', state, accountId: response.data.id }
        window.opener?.postMessage(message, window.location.origin)
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('mailbox-oauth')
          channel.postMessage(message)
          channel.close()
        }
        setConnected(true)
        window.close()
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        setError(detail || 'Could not connect the mailbox. Close this window and try again.')
      }
    }

    void complete()
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-sm" role="status" aria-live="polite">
        <h1 className="text-lg font-semibold">
          {error ? 'Mailbox connection unsuccessful' : connected ? 'Mailbox connected' : 'Connecting your mailbox…'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || (connected ? 'You can close this window and continue in MailFlow.' : 'Finishing authorization with your email provider.')}
        </p>
        {(error || connected) && (
          <button type="button" onClick={() => window.close()} className="mt-4 text-sm text-primary underline">Close window</button>
        )}
      </div>
    </main>
  )
}
