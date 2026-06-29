'use client'
import { useQuery } from '@tanstack/react-query'
import { inboxApi } from '@/lib/api'
import { ContactStats } from '@/lib/types'
import { Skeleton } from '@/components/shared/loading-skeleton'
import { Send, Eye, MousePointerClick, MessageSquareReply, OctagonAlert } from 'lucide-react'

const STATS = [
  { key: 'total_sent', label: 'Sent', icon: Send },
  { key: 'opened', label: 'Opened', icon: Eye },
  { key: 'clicked', label: 'Clicked', icon: MousePointerClick },
  { key: 'replied', label: 'Replied', icon: MessageSquareReply },
  { key: 'bounced', label: 'Bounced', icon: OctagonAlert },
] as const

export function ContactStatsPanel({ threadId }: { threadId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inbox-contact-stats', threadId],
    queryFn: () => inboxApi.contactStats(threadId).then(r => r.data as ContactStats),
  })

  return (
    <div className="w-[260px] border-l bg-card shrink-0 p-4 space-y-4 overflow-y-auto">
      <h3 className="text-sm font-semibold">Contact activity</h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {STATS.map(s => (
              <div key={s.key} className="rounded-lg border p-2.5">
                <s.icon size={13} className="text-muted-foreground mb-1" />
                <p className="text-lg font-semibold leading-none">{data[s.key]}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          {data.campaigns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Campaigns</p>
              <div className="space-y-1">
                {data.campaigns.map(name => (
                  <p key={name} className="text-xs truncate bg-muted rounded px-2 py-1">{name}</p>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
