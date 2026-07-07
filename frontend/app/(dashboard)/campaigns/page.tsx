'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { CampaignListItem, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { cn } from '@/lib/utils'
import { Plus, Search, Trash2, Megaphone, Play, Pause, Mail, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const STATUS_META: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  active:    { label: 'Active',    dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400',  bg: 'bg-green-500/10' },
  paused:    { label: 'Paused',    dot: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-400',  bg: 'bg-amber-500/10' },
  draft:     { label: 'Draft',     dot: 'bg-muted-foreground', text: 'text-muted-foreground',        bg: 'bg-muted' },
  completed: { label: 'Completed', dot: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-400',    bg: 'bg-blue-500/10' },
}

function StatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] || STATUS_META.draft
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', m.bg, m.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}

const pct = (num: number, denom: number) => (denom > 0 ? Math.round((num / denom) * 100) : 0)

/** Instantly-style metric cell: bold rate %, muted raw count beneath. */
function MetricCell({ value, total, tone }: { value: number; total: number; tone: string }) {
  const rate = pct(value, total)
  return (
    <td className="px-4 py-3">
      <div className="flex flex-col">
        <span className={cn('font-mono font-semibold tabular-nums', total > 0 ? tone : 'text-muted-foreground')}>
          {rate}%
        </span>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">{value.toLocaleString()}</span>
      </div>
    </td>
  )
}

export default function CampaignsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { search, status, page }],
    queryFn: () => campaignsApi.getAll({ search, status: status || undefined, page }).then(r => r.data as PaginatedResponse<CampaignListItem>),
    refetchInterval: 10000,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => campaignsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign deleted'); setDeleteId(null) },
  })

  const activateMut = useMutation({
    mutationFn: (id: number) => campaignsApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign activated') },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to activate'),
  })

  const pauseMut = useMutation({
    mutationFn: (id: number) => campaignsApi.pause(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign paused') },
  })

  const resumeMut = useMutation({
    mutationFn: (id: number) => campaignsApi.resume(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign resumed') },
  })

  const campaigns = data?.items || []
  const total = data?.count || 0

  // Portfolio totals across the visible page — mirrors Instantly's summary strip.
  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.sent,
      opened: acc.opened + c.opened,
      clicked: acc.clicked + c.clicked,
      replied: acc.replied + c.replied,
      enrolled: acc.enrolled + c.enrollment_count,
    }),
    { sent: 0, opened: 0, clicked: 0, replied: 0, enrolled: 0 }
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Single emails or multi-step drip campaigns for cold outreach</p>
        </div>
        <Link href="/campaigns/new">
          <Button><Plus size={16} /> New Campaign</Button>
        </Link>
      </div>

      {/* Summary strip */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Enrolled', value: totals.enrolled.toLocaleString(), tone: 'text-foreground' },
            { label: 'Sent', value: totals.sent.toLocaleString(), tone: 'text-foreground' },
            { label: 'Open rate', value: `${pct(totals.opened, totals.sent)}%`, sub: totals.opened.toLocaleString(), tone: 'text-purple-600' },
            { label: 'Click rate', value: `${pct(totals.clicked, totals.sent)}%`, sub: totals.clicked.toLocaleString(), tone: 'text-blue-600' },
            { label: 'Reply rate', value: `${pct(totals.replied, totals.sent)}%`, sub: totals.replied.toLocaleString(), tone: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-2xl font-bold mt-1 tabular-nums', s.tone)}>{s.value}</p>
              {s.sub !== undefined && <p className="text-xs text-muted-foreground tabular-nums">{s.sub}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={7} /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create a campaign to send a single email or a multi-step drip to your leads."
            action={{ label: 'Create Campaign', onClick: () => router.push('/campaigns/new') }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Enrolled</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sent</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Opened</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Clicked</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Replied</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="table-row-hover cursor-pointer"
                      onClick={() => router.push(`/campaigns/${campaign.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium hover:text-primary transition-colors">{campaign.name}</p>
                        <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Layers size={11} /> {campaign.step_count} step{campaign.step_count === 1 ? '' : 's'}</span>
                          <span className="inline-flex items-center gap-1"><Mail size={11} /> {campaign.contact_list_count} list{campaign.contact_list_count === 1 ? '' : 's'}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={campaign.status} /></td>
                      <td className="px-4 py-3 font-medium tabular-nums">{campaign.enrollment_count.toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{campaign.sent.toLocaleString()}</td>
                      <MetricCell value={campaign.opened} total={campaign.sent} tone="text-purple-600" />
                      <MetricCell value={campaign.clicked} total={campaign.sent} tone="text-blue-600" />
                      <MetricCell value={campaign.replied} total={campaign.sent} tone="text-green-600" />
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {(campaign.status === 'draft' || campaign.status === 'paused') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={campaign.status === 'draft' ? 'Activate' : 'Resume'}
                              onClick={() => campaign.status === 'draft' ? activateMut.mutate(campaign.id) : resumeMut.mutate(campaign.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Play size={14} />
                            </Button>
                          )}
                          {campaign.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Pause"
                              onClick={() => pauseMut.mutate(campaign.id)}
                            >
                              <Pause size={14} />
                            </Button>
                          )}
                          {campaign.status !== 'active' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(campaign.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">{total} total campaigns</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!data?.next}>Next</Button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Campaign"
        description="This campaign and its steps will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
