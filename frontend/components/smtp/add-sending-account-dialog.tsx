'use client'

import { useQuery } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, Loader2, Mail } from 'lucide-react'

type Provider = 'google' | 'microsoft'

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
        <path fill="#4285F4" d="M21.35 12.22c0-.71-.06-1.42-.18-2.1H12v3.98h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z" />
        <path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.44-2.36l-3.14-2.44c-.87.58-1.98.92-3.3.92-2.54 0-4.69-1.71-5.46-4.01H3.3v2.52A9.73 9.73 0 0 0 12 21.5Z" />
        <path fill="#FBBC05" d="M6.54 13.61a5.85 5.85 0 0 1 0-3.72V7.37H3.3a9.73 9.73 0 0 0 0 8.76l3.24-2.52Z" />
        <path fill="#EA4335" d="M12 5.88c1.39 0 2.64.48 3.62 1.43l2.71-2.72A9.21 9.21 0 0 0 12 2a9.73 9.73 0 0 0-8.7 5.37l3.24 2.52C7.31 7.59 9.46 5.88 12 5.88Z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 36 36" width="29" height="29" aria-hidden="true">
      <rect x="12" y="4" width="21" height="26" rx="2" fill="#0078D4" />
      <path d="M12 14 22.5 21 33 14v14a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2Z" fill="#28A8EA" />
      <path d="m12 14 10.5 7L33 14" fill="none" stroke="#B7E8FF" strokeWidth="1.5" />
      <rect x="3" y="9" width="19" height="20" rx="2" fill="#0067B8" />
      <ellipse cx="12.5" cy="19" rx="5" ry="6" fill="none" stroke="white" strokeWidth="2.6" />
    </svg>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  onProvider: (provider: Provider) => void
  onManual: () => void
  pendingProvider: Provider | null
}

export function AddSendingAccountDialog({ open, onClose, onProvider, onManual, pendingProvider }: Props) {
  const { data: providers } = useQuery({
    queryKey: ['mailbox-oauth-providers'],
    queryFn: () => smtpApi.oauthProviders().then(response => response.data),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an email account</DialogTitle>
          <DialogDescription>Choose how to connect your sending mailbox.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {(['google', 'microsoft'] as const).map(provider => {
            const enabled = providers?.some(item => item.provider === provider && item.enabled)
            return (
              <button key={provider} type="button" disabled={!enabled || !!pendingProvider}
                onClick={() => onProvider(provider)}
                className="flex w-full items-center gap-3 rounded-xl border p-4 text-left hover:border-primary/50 hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-55">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white">
                  <ProviderIcon provider={provider} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{provider === 'google' ? 'Google / Gmail' : 'Microsoft / Outlook'}</span>
                  <span className="block text-xs text-muted-foreground">{enabled ? 'Connect in a small sign-in window' : 'Available after administrator setup'}</span>
                </span>
                {pendingProvider === provider ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              </button>
            )
          })}
          <button type="button" onClick={onManual}
            className="flex w-full items-center gap-3 rounded-xl border p-4 text-left hover:border-primary/50 hover:bg-accent/40">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"><Mail size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">SMTP / IMAP</span>
              <span className="block text-xs text-muted-foreground">Enter your mail server details</span>
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
