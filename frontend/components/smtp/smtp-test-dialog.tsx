'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, XCircle, FlaskConical } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
  onTested: () => void
}

export function SMTPTestDialog({ open, onClose, account, onTested }: Props) {
  const [testEmail, setTestEmail] = useState('')
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  const mutation = useMutation({
    mutationFn: () => smtpApi.test(account!.id, testEmail),
    onSuccess: (res) => {
      setResult(res.data)
      onTested()
      if (res.data.success) {
        toast.success('Test email sent successfully!')
      } else {
        toast.error(res.data.error || 'Test failed')
      }
    },
    onError: (err: any) => {
      const data = err.response?.data || {}
      setResult({ success: false, error: data.error || 'Connection failed' })
      onTested()
    },
  })

  const handleClose = () => {
    setResult(null)
    setTestEmail('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical size={18} />
            Test SMTP — {account?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p><strong>Host:</strong> {account?.host}:{account?.port}</p>
            <p><strong>Security:</strong> {account?.security?.toUpperCase()}</p>
            <p><strong>From:</strong> {account?.from_name} &lt;{account?.from_email}&gt;</p>
          </div>

          {result && (
            <div className={`rounded-lg p-3 flex items-start gap-3 ${
              result.success
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              {result.success ? (
                <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium text-sm ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                  {result.success ? 'Connection successful!' : 'Connection failed'}
                </p>
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {result.message || result.error}
                </p>
              </div>
            </div>
          )}

          <div>
            <Label>Send test email to *</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!testEmail}
          >
            <FlaskConical size={14} /> Send Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
