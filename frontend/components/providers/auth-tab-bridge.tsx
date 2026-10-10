'use client'

import { useEffect } from 'react'
import { clearTokens, getAccessToken, getRefreshToken } from '@/lib/auth'

export function AuthTabBridge() {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('mailflow-auth')
    channel.onmessage = event => {
      const message = event.data
      if (message?.type === 'session-request' && typeof message.requestId === 'string') {
        const access = getAccessToken()
        const refresh = getRefreshToken()
        if (access && refresh) {
          channel.postMessage({ type: 'session-response', requestId: message.requestId, access, refresh })
        }
      } else if (message?.type === 'logout') {
        clearTokens()
        window.location.replace('/login')
      }
    }
    return () => channel.close()
  }, [])
  return null
}
