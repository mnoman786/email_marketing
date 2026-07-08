'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount, DeliverabilityResult, DeliverabilityCheck } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
}

function CheckRow({ label, check }: { label: string; check: DeliverabilityCheck & { policy?: string | null; selector?: string | null } }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        {check.found ? (
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
        ) : (
          <XCircle size={16} className="text-red-500 shrink-0" />
        )}
        <p className="font-medium text-sm">{label}</p>
        {check.selector && (
          <span className="badge bg-muted text-muted-foreground text-[10px]">selector: {check.selector}</span>
        )}
        {check.policy && (
          <span className="badge bg-muted text-muted-foreground text-[10px]">policy: {check.policy}</span>
        )}
      </div>
      {check.record && (
        <p className="font-mono text-[11px] text-muted-foreground break-all pl-6">{check.record}</p>
      )}
      {(check.issues || []).map((issue, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-amber-600 pl-6">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {issue}
        </p>
      ))}
    </div>
  )
}

export function DeliverabilityDialog({ open, onClose, account }: Props) {
  const [dkimSelector, setDkimSelector] = useState('')

  const mutation = useMutation({
    mutationFn: () => smtpApi.deliverability(account!.id, dkimSelector || undefined).then(r => r.data as DeliverabilityResult),
  })

  const handleClose = () => {
    mutation.reset()
    setDkimSelector('')
    onClose()
  }

  const result = mutation.data

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} />
            Deliverability — {account?.name}
          </DialogTitle>
          <DialogDescription>
            Read-only DNS lookup for SPF, DKIM, and DMARC on {account?.from_email?.split('@')[1] || 'this domain'}.
            No email is sent and no recipient server is contacted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>DKIM selector (optional)</Label>
              <Input
                placeholder="e.g. selector1, google, mandrill..."
                value={dkimSelector}
                onChange={e => setDkimSelector(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                We already check common provider selectors — only set this if your DKIM record uses a custom one.
              </p>
            </div>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} className="shrink-0">
              <RefreshCw size={14} /> {result ? 'Re-check' : 'Check'}
            </Button>
          </div>

          {result && (
            <div className="space-y-2">
              <CheckRow label="SPF" check={result.spf} />
              <CheckRow label="DMARC" check={result.dmarc} />
              <CheckRow label="DKIM" check={result.dkim} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
