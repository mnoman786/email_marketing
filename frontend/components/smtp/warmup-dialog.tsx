'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Flame, AlertTriangle, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
}

export function WarmupDialog({ open, onClose, account }: Props) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [targetDaily, setTargetDaily] = useState(40)
  const [rampStep, setRampStep] = useState(4)
  const [replyRate, setReplyRate] = useState(35)

  const { data, isLoading } = useQuery({
    queryKey: ['warmup', account?.id],
    queryFn: () => smtpApi.getWarmup(account!.id).then(r => r.data),
    enabled: open && !!account,
  })

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setTargetDaily(data.target_daily)
      setRampStep(data.ramp_step)
      setReplyRate(data.reply_rate)
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: (payload: any) => smtpApi.updateWarmup(account!.id, payload),
    onSuccess: (res) => {
      qc.setQueryData(['warmup', account?.id], res.data)
      qc.invalidateQueries({ queryKey: ['smtp-accounts'] })
      toast.success('Warmup settings saved')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Could not save warmup settings')
    },
  })

  const imapOff = account && !account.imap_enabled

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame size={18} className="text-orange-500" />
            Warmup — {account?.name}
          </DialogTitle>
        </DialogHeader>

        {imapOff ? (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Enable IMAP for this mailbox first — warmup needs to receive mail to recognise it,
              mark it read, and auto-reply.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Enable warmup</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gradually builds sender reputation by exchanging real mail with other warmup mailboxes.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
            </div>

            {/* Live stats */}
            {data && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{data.sent_today}</p>
                  <p className="text-[11px] text-muted-foreground">sent today</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold flex items-center justify-center gap-1">
                    <TrendingUp size={14} className="text-green-600" />{data.todays_target}
                  </p>
                  <p className="text-[11px] text-muted-foreground">today's target</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{data.pool_size}</p>
                  <p className="text-[11px] text-muted-foreground">peers in pool</p>
                </div>
              </div>
            )}

            {data && data.pool_size === 0 && enabled && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No other warmup mailboxes yet — enable warmup on at least one more SMTP account so they can exchange mail.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Daily target</Label>
                <Input
                  type="number" min={1} max={200} value={targetDaily}
                  onChange={e => setTargetDaily(Number(e.target.value))}
                  className="mt-1" disabled={!enabled}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Emails/day at full ramp</p>
              </div>
              <div>
                <Label>Ramp-up step</Label>
                <Input
                  type="number" min={1} max={50} value={rampStep}
                  onChange={e => setRampStep(Number(e.target.value))}
                  className="mt-1" disabled={!enabled}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Daily increase until target</p>
              </div>
            </div>

            <div>
              <Label>Auto-reply rate — {replyRate}%</Label>
              <input
                type="range" min={0} max={100} step={5} value={replyRate}
                onChange={e => setReplyRate(Number(e.target.value))}
                className="w-full mt-2 accent-primary cursor-pointer" disabled={!enabled}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Share of received warmup emails this mailbox replies to (two-way looks more human).
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({
              enabled, target_daily: targetDaily, ramp_step: rampStep, reply_rate: replyRate,
            })}
            loading={mutation.isPending}
            disabled={!!imapOff}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
