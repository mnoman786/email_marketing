'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import toast from 'react-hot-toast'

type Provider = 'google' | 'microsoft'
type OAuthResult = { type: 'mailbox-oauth-complete'; state: string; accountId: number }

export function useMailboxOAuthPopup(onConnected?: (accountId: number) => void) {
  const queryClient = useQueryClient()
  const popupRef = useRef<Window | null>(null)
  const expectedState = useRef<string | null>(null)
  const onConnectedRef = useRef(onConnected)
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null)

  useEffect(() => { onConnectedRef.current = onConnected }, [onConnected])

  useEffect(() => {
    const complete = (data: OAuthResult) => {
      if (data.type !== 'mailbox-oauth-complete' || !expectedState.current || data.state !== expectedState.current) return
      expectedState.current = null
      queryClient.invalidateQueries({ queryKey: ['smtp-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['smtp-all'] })
      queryClient.invalidateQueries({ queryKey: ['smtp-stats'] })
      onConnectedRef.current?.(data.accountId)
      popupRef.current?.close()
      popupRef.current = null
      setPendingProvider(null)
      toast.success('Mailbox connected')
    }
    const onMessage = (event: MessageEvent<OAuthResult>) => {
      if (event.origin === window.location.origin && event.source === popupRef.current) complete(event.data)
    }
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mailbox-oauth') : null
    if (channel) channel.onmessage = (event: MessageEvent<OAuthResult>) => complete(event.data)
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      channel?.close()
    }
  }, [queryClient])

  useEffect(() => {
    if (!pendingProvider) return
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null
        expectedState.current = null
        setPendingProvider(null)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [pendingProvider])

  const start = useCallback(async (provider: Provider, accountId?: number) => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus()
      return
    }
    // Open on the click event, before the API request, so popup blockers allow it.
    const popup = window.open('', '_blank', 'popup=yes,width=520,height=680,scrollbars=yes,resizable=yes')
    if (!popup) {
      toast.error('Allow popups for this site to connect your mailbox.')
      return
    }
    popupRef.current = popup
    popup.document.title = 'Connect mailbox'
    popup.document.body.textContent = 'Opening secure sign-in…'
    setPendingProvider(provider)
    try {
      const { data } = await smtpApi.oauthStart(provider, accountId)
      if (popup.closed) {
        setPendingProvider(null)
        return
      }
      expectedState.current = data.state
      popup.sessionStorage.setItem('mailbox_oauth_state', data.state)
      popup.sessionStorage.setItem('mailbox_oauth_popup', '1')
      popup.location.replace(data.authorization_url)
    } catch (error: unknown) {
      popup.close()
      popupRef.current = null
      expectedState.current = null
      setPendingProvider(null)
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      toast.error(detail || 'Could not start mailbox connection')
    }
  }, [])

  return { start, pendingProvider }
}
