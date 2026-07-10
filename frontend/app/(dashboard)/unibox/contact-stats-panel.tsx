'use client'
import { useQuery } from '@tanstack/react-query'
import { inboxApi } from '@/lib/api'
import { ContactStats, ThreadDetail } from '@/lib/types'
import { Skeleton } from '@/components/shared/loading-skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Eye, MousePointerClick, MessageSquareReply, OctagonAlert, Mailbox, Megaphone } from 'lucide-react'
import { cn, avatarColor, initials } from '@/lib/utils'

const LEAD_STATUSES = [
  { value: 'none',           label: 'No status',       dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground' },
  { value: 'interested',     label: 'Interested',      dot: 'bg-emerald-500',         badge: 'bg-emerald-50 text-emerald-700' },
  { value: 'not_interested', label: 'Not Interested',  dot: 'bg-rose-500',            badge: 'bg-rose-50 text-rose-700' },
  { value: 'meeting_booked', label: 'Meeting Booked',  dot: 'bg-violet-500',          badge: 'bg-violet-50 text-violet-700' },
] as const

const STATS = [
  { key: 'total_sent', label: 'Sent',    icon: Send              },
  { key: 'opened',     label: 'Opened',  icon: Eye               },
  { key: 'clicked',    label: 'Clicked', icon: MousePointerClick  },
  { key: 'replied',    label: 'Replied', icon: MessageSquareReply },
  { key: 'bounced',    label: 'Bounced', icon: OctagonAlert       },
] as const

interface Props {
  threadId: number
  thread?: ThreadDetail
  onStatusChange?: (status: string) => void
}

export function ContactStatsPanel({ threadId, thread, onStatusChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['inbox-contact-stats', threadId],
    queryFn: () => inboxApi.contactStats(threadId).then(r => r.data as ContactStats),
  })

  const leadStatusMeta = (status: string) => LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]

  return (
    <div className="w-70 border-l bg-card shrink-0 flex flex-col overflow-y-auto">
      {/* Lead profile */}
      {thread && (
        <div className="p-4 border-b space-y-3">
          <div className="flex flex-col items-center text-center gap-2 pt-1 pb-1">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0',
              avatarColor(thread.contact_name || thread.contact_email)
            )}>
              {initials(thread.contact_name || thread.contact_email)}
            </div>
            <div>
              <p className="font-semibold text-sm leading-snug">
                {thread.contact_name || thread.contact_email}
              </p>
              {thread.contact_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{thread.contact_email}</p>
              )}
            </div>
          </div>

          {onStatusChange && (
            <Select value={thread.lead_status} onValueChange={onStatusChange}>
              <SelectTrigger className="h-8 text-xs rounded-lg">
                <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5 shrink-0', leadStatusMeta(thread.lead_status).dot)} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">
                      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-0.5">
            <Mailbox size={12} className="shrink-0" />
            <span className="truncate">{thread.smtp_account_name}</span>
          </div>
        </div>
      )}

      {/* Activity stats */}
      <div className="p-4 space-y-4 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Activity</p>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {STATS.map(s => (
                <div key={s.key} className="rounded-lg border bg-muted/20 p-2.5">
                  <s.icon size={13} className="text-muted-foreground mb-1.5" />
                  <p className="text-lg font-semibold leading-none">{data[s.key]}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {data.campaigns.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Megaphone size={11} /> Campaigns
                </p>
                <div className="space-y-1">
                  {data.campaigns.map((name, i) => (
                    <div key={`${name}-${i}`} className="flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg bg-muted/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
