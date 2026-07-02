'use client'
import { useParams, useRouter } from 'next/navigation'
import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageSkeleton } from '@/components/shared/loading-skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDateTime, cn } from '@/lib/utils'
import { ArrowLeft, Play, Pause, Pencil, Trash2, BarChart3, Users, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

const STATUS_META: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  active:    { label: 'Active',    dot: 'bg-green-500',        text: 'text-green-700 dark:text-green-400', bg: 'bg-green-500/10' },
  paused:    { label: 'Paused',    dot: 'bg-amber-500',        text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10' },
  draft:     { label: 'Draft',     dot: 'bg-muted-foreground', text: 'text-muted-foreground',              bg: 'bg-muted' },
  completed: { label: 'Completed', dot: 'bg-blue-500',         text: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-500/10' },
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

export default function CampaignDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const qc = useQueryClient()
  const [showDelete, setShowDelete] = useState(false)
  const [tab, setTab] = useState<'analytics' | 'leads'>('analytics')

  const { data: campaign, isLoading, isError } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(Number(id)).then(r => r.data as Campaign),
    refetchInterval: (query) => {
      const data = query.state.data as Campaign | undefined
      return data?.status === 'active' ? 10000 : false
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => campaignsApi.stats(Number(id)).then(r => r.data),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const { data: enrollments } = useQuery({
    queryKey: ['campaign-enrollments', id],
    queryFn: () => campaignsApi.enrollments(Number(id), { page_size: 25 }).then(r => r.data),
    enabled: !!id,
  })

  const activateMut = useMutation({
    mutationFn: () => campaignsApi.activate(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); toast.success('Campaign activated') },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to activate'),
  })

  const pauseMut = useMutation({
    mutationFn: () => campaignsApi.pause(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); toast.success('Campaign paused') },
  })

  const resumeMut = useMutation({
    mutationFn: () => campaignsApi.resume(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); toast.success('Campaign resumed') },
  })

  const deleteMut = useMutation({
    mutationFn: () => campaignsApi.delete(Number(id)),
    onSuccess: () => { toast.success('Campaign deleted'); router.push('/campaigns') },
  })

  if (isLoading) return <PageSkeleton />
  if (isError || !campaign) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-10 text-center">
          <p className="font-medium">Couldn’t load this campaign</p>
          <p className="text-sm text-muted-foreground mt-1">It may have been deleted, or the server returned an error.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['campaign', id] })}>
              <RefreshCw size={14} /> Retry
            </Button>
            <Button size="sm" onClick={() => router.push('/campaigns')}>Back to campaigns</Button>
          </div>
        </div>
      </div>
    )
  }

  const totalEnrolled = stats?.total_enrolled || 0
  const counts = stats?.enrollment_counts || {}
  const steps: any[] = stats?.steps || []

  // Campaign-wide email performance — each SendLog belongs to exactly one step,
  // so summing per-step buckets gives the campaign totals.
  const perf = steps.reduce(
    (a, s) => ({
      sent: a.sent + (s.sent || 0),
      failed: a.failed + (s.failed || 0),
      opened: a.opened + (s.opened || 0),
      clicked: a.clicked + (s.clicked || 0),
      replied: a.replied + (s.replied || 0),
    }),
    { sent: 0, failed: 0, opened: 0, clicked: 0, replied: 0 }
  )

  const kpis = [
    { label: 'Enrolled', value: totalEnrolled.toLocaleString(), sub: `${counts.active || 0} active`, tone: 'text-foreground' },
    { label: 'Sent', value: perf.sent.toLocaleString(), sub: perf.failed ? `${perf.failed} failed` : 'delivered', tone: 'text-foreground' },
    { label: 'Open rate', value: `${pct(perf.opened, perf.sent)}%`, sub: `${perf.opened.toLocaleString()} opens`, tone: 'text-purple-600' },
    { label: 'Click rate', value: `${pct(perf.clicked, perf.sent)}%`, sub: `${perf.clicked.toLocaleString()} clicks`, tone: 'text-blue-600' },
    { label: 'Reply rate', value: `${pct(perf.replied, perf.sent)}%`, sub: `${perf.replied.toLocaleString()} replies`, tone: 'text-green-600' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="rounded-2xl border bg-card p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/campaigns')} className="shrink-0">
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold truncate">{campaign.name}</h1>
              <StatusPill status={campaign.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {campaign.steps.length} step(s) · Created {formatDateTime(campaign.created_at)} · Updated {formatDateTime(campaign.updated_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(campaign.status === 'draft' || campaign.status === 'paused') && (
            <Link href={`/campaigns/${id}/edit`}>
              <Button variant="outline" size="sm"><Pencil size={14} /> Edit</Button>
            </Link>
          )}
          {campaign.status === 'draft' && (
            <Button size="sm" onClick={() => activateMut.mutate()} disabled={activateMut.isPending}>
              <Play size={14} /> Activate
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>
              <Play size={14} /> Resume
            </Button>
          )}
          {campaign.status === 'active' && (
            <Button variant="outline" size="sm" onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}>
              <Pause size={14} /> Pause
            </Button>
          )}
          {campaign.status !== 'active' && (
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          { key: 'analytics', label: 'Analytics', icon: BarChart3 },
          { key: 'leads', label: 'Leads', icon: Users, badge: totalEnrolled },
        ] as const).map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon size={15} />
              {t.label}
              {'badge' in t && t.badge !== undefined && (
                <span className={cn('text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                  active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {t.badge}
                </span>
              )}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
            </button>
          )
        })}
      </div>

      {tab === 'analytics' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {kpis.map(kpi => (
              <Card key={kpi.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className={cn('text-3xl font-bold mt-2 tabular-nums', kpi.tone)}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Enrollment status breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Active', value: counts.active || 0, tone: 'text-amber-600' },
              { label: 'Completed', value: counts.completed || 0, tone: 'text-green-600' },
              { label: 'Stopped (engaged)', value: counts.stopped || 0, tone: 'text-purple-600' },
              { label: 'Unsubscribed', value: counts.unsubscribed || 0, tone: 'text-red-500' },
              { label: 'Bounced', value: counts.bounced || 0, tone: 'text-red-500' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn('text-2xl font-bold mt-1 tabular-nums', s.tone)}>{s.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Step-by-step performance */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="font-semibold text-sm">Step-by-step performance</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Step</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Sent</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Opened</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Clicked</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Replied</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {steps.map((step: any) => (
                    <Fragment key={step.step_id}>
                      <tr>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">Step {step.order}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-xs">{step.subject}</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium">{step.sent}</td>
                        <td className="px-4 py-2.5 tabular-nums text-purple-600">{step.opened} <span className="text-xs text-muted-foreground">({pct(step.opened, step.sent)}%)</span></td>
                        <td className="px-4 py-2.5 tabular-nums text-blue-600">{step.clicked} <span className="text-xs text-muted-foreground">({pct(step.clicked, step.sent)}%)</span></td>
                        <td className="px-4 py-2.5 tabular-nums text-green-600">{step.replied} <span className="text-xs text-muted-foreground">({pct(step.replied, step.sent)}%)</span></td>
                        <td className="px-4 py-2.5 tabular-nums text-red-500">{step.failed}</td>
                      </tr>
                      {(step.variants || []).length > 1 && step.variants.map((variant: any) => {
                        const activeCount = step.variants.filter((v: any) => v.is_active).length
                        const isWinner = step.auto_optimize && activeCount === 1 && variant.is_active
                        return (
                          <tr key={variant.variant_id} className={cn('bg-muted/20', !variant.is_active && 'opacity-50')}>
                            <td className="px-4 py-2 pl-8 text-xs text-muted-foreground whitespace-nowrap">
                              ↳ Variant {variant.label}
                              {isWinner && <span className="ml-1 text-amber-600 font-medium">🏆 winner</span>}
                              {!variant.is_active && <span className="ml-1 italic">(disabled)</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-xs">{variant.subject}</td>
                            <td className="px-4 py-2 text-xs tabular-nums">{variant.sent}</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-purple-600">{variant.opened} ({pct(variant.opened, variant.sent)}%)</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-blue-600">{variant.clicked} ({pct(variant.clicked, variant.sent)}%)</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-green-600">{variant.replied} ({pct(variant.replied, variant.sent)}%)</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-red-500">{variant.failed}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                  {steps.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No steps yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {enrollments?.items?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Current Step</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Next Send</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Enrolled At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enrollments.items.map((e: any) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-xs">{e.contact_name || <span className="text-muted-foreground italic">Deleted contact</span>}</p>
                        <p className="text-muted-foreground text-xs">{e.contact_email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{e.current_step_order ?? '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.status === 'active' && e.next_send_at ? formatDateTime(e.next_send_at) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(e.enrolled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              No contacts enrolled yet.
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => deleteMut.mutate()}
        title="Delete Campaign"
        description="This campaign and its steps will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
