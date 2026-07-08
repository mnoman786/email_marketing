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
import {
  ArrowLeft, Play, Pause, Pencil, Trash2, BarChart3, Users, RefreshCw, Clock, Send, CheckCircle2,
  ListFilter, Server, Mail, ReplyAll, AlertTriangle, Eye, MousePointerClick, MessageSquareOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

// Compact relative time, e.g. "in 3h" / "5m ago". Null-safe.
function fromNow(iso?: string | null): string | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  const hrs = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)
  const s = abs < 60000 ? 'just now' : mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`
  if (s === 'just now') return s
  return diff >= 0 ? `in ${s}` : `${s} ago`
}

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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Human label for a step's delay since the previous step (or enrollment).
function delayLabel(days: number, hours: number): string {
  if (!days && !hours) return 'Immediately'
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  return `+${parts.join(' ')}`
}

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

  // Scheduling insights
  const nextSendAt: string | null = stats?.next_send_at || null
  const upcoming: number = stats?.upcoming_count || 0
  const dueNow: number = stats?.due_now || 0
  const lastSentAt: string | null = stats?.last_sent_at || null
  const timeline: { date: string; count: number }[] = stats?.sends_timeline || []
  const deliveryRate = pct(perf.sent, perf.sent + perf.failed)

  // Only surface open/click metrics if the campaign was created with that tracking
  // enabled — otherwise the counts are always zero and misleading.
  const trackOpens = campaign.track_opens
  const trackClicks = campaign.track_clicks

  const opportunities = stats?.opportunities || 0
  const kpis = [
    { label: 'Enrolled', value: totalEnrolled.toLocaleString(), sub: `${counts.active || 0} active`, tone: 'text-foreground' },
    { label: 'Sent', value: perf.sent.toLocaleString(), sub: perf.failed ? `${perf.failed} failed` : 'delivered', tone: 'text-foreground' },
    trackOpens && { label: 'Open rate', value: `${pct(perf.opened, perf.sent)}%`, sub: `${perf.opened.toLocaleString()} opens`, tone: 'text-purple-600' },
    trackClicks && { label: 'Click rate', value: `${pct(perf.clicked, perf.sent)}%`, sub: `${perf.clicked.toLocaleString()} clicks`, tone: 'text-blue-600' },
    { label: 'Reply rate', value: `${pct(perf.replied, perf.sent)}%`, sub: `${perf.replied.toLocaleString()} replies`, tone: 'text-green-600' },
    { label: 'Opportunities', value: opportunities.toLocaleString(), sub: 'interested leads', tone: 'text-emerald-600' },
  ].filter(Boolean) as { label: string; value: string; sub: string; tone: string }[]

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

      {/* Setup summary — sending accounts, lists, from/reply-to, schedule, tracking.
          Otherwise this is invisible unless you open Edit. */}
      <div className="rounded-2xl border bg-card p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Server size={13} /> Sending accounts</p>
          {campaign.smtp_accounts_detail.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {campaign.smtp_accounts_detail.map(a => (
                <span key={a.id} className={cn('badge text-xs', a.is_active ? 'bg-muted text-muted-foreground' : 'bg-red-100 text-red-700')}>
                  {a.from_email}{!a.is_active && ' (inactive)'}
                </span>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 mt-1.5">
              <AlertTriangle size={13} /> None selected — falls back to every active account
            </p>
          )}
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ListFilter size={13} /> Contact lists</p>
          {campaign.contact_lists_detail.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {campaign.contact_lists_detail.map(l => (
                <span key={l.id} className="badge bg-muted text-muted-foreground text-xs">{l.name} · {l.contact_count}</span>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 mt-1.5">
              <AlertTriangle size={13} /> No lists attached — nobody will be enrolled
            </p>
          )}
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Mail size={13} /> From / Reply-To</p>
          <p className="text-sm mt-1.5 truncate">
            {campaign.from_name || <span className="text-muted-foreground italic">No from name</span>}
            {campaign.from_email && <span className="text-muted-foreground"> &lt;{campaign.from_email}&gt;</span>}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <ReplyAll size={12} /> {campaign.reply_to || 'Same as sending account'}
          </p>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock size={13} /> Schedule</p>
          {campaign.schedule_enabled ? (
            <>
              <p className="text-sm mt-1.5">
                {campaign.schedule_days.map(d => DAY_LABELS[d]).join(', ') || 'No days selected'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {campaign.schedule_start_time.slice(0, 5)}–{campaign.schedule_end_time.slice(0, 5)} ({campaign.schedule_timezone})
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1.5">Sends anytime — no business-hours restriction</p>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-wrap items-center gap-4 pt-3 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Eye size={13} className={campaign.track_opens ? 'text-purple-600' : ''} /> Open tracking {campaign.track_opens ? 'on' : 'off'}</span>
          <span className="flex items-center gap-1.5"><MousePointerClick size={13} className={campaign.track_clicks ? 'text-blue-600' : ''} /> Click tracking {campaign.track_clicks ? 'on' : 'off'}</span>
          <span className="flex items-center gap-1.5"><MessageSquareOff size={13} className={campaign.stop_on_reply ? 'text-green-600' : ''} /> Stop on reply {campaign.stop_on_reply ? 'on' : 'off'}</span>
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
          {/* Scheduling: when does the next email go out? */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border bg-linear-to-br from-primary/10 to-transparent p-5 md:col-span-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock size={15} /> Next email
              </div>
              {campaign.status === 'active' ? (
                nextSendAt ? (
                  <div className="mt-2">
                    <p className="text-3xl font-bold tabular-nums">
                      {dueNow > 0 ? 'Sending now' : fromNow(nextSendAt)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {dueNow > 0
                        ? `${dueNow.toLocaleString()} email(s) queued for the next send cycle`
                        : `Scheduled for ${formatDateTime(nextSendAt)}`}
                      {upcoming > 0 && ` · ${upcoming.toLocaleString()} upcoming`}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold mt-2 text-muted-foreground">
                    No emails scheduled — all enrolled leads have completed the sequence.
                  </p>
                )
              ) : (
                <p className="text-lg font-semibold mt-2 text-muted-foreground">
                  {campaign.status === 'paused' ? 'Paused — resume to continue sending.'
                    : campaign.status === 'draft' ? 'Draft — activate to start sending.'
                    : 'Campaign completed.'}
                </p>
              )}
            </div>
            <div className="rounded-2xl border bg-card p-5 flex flex-col justify-center gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Send size={13} /> Last sent</div>
                <p className="text-sm font-semibold mt-0.5">{lastSentAt ? fromNow(lastSentAt) : '—'}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 size={13} /> Delivery rate</div>
                <p className="text-sm font-semibold mt-0.5 tabular-nums">{deliveryRate}%</p>
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
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

          {/* Sends over the last 14 days */}
          {(() => {
            const max = Math.max(1, ...timeline.map(d => d.count))
            const totalWindow = timeline.reduce((a, d) => a + d.count, 0)
            return (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Sends · last 14 days</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{totalWindow.toLocaleString()} total</p>
                </div>
                <div className="mt-4 flex items-end gap-1.5 h-28">
                  {timeline.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end group">
                      <div
                        className="w-full rounded-t bg-primary/70 group-hover:bg-primary transition-colors min-h-0.5"
                        style={{ height: `${(d.count / max) * 100}%` }}
                        title={`${d.date}: ${d.count} sent`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>{timeline[0]?.date?.slice(5)}</span>
                  <span>{timeline[timeline.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
            )
          })()}

          {/* Step-by-step performance */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
              <p className="font-semibold text-sm">Step-by-step performance</p>
              {(!trackOpens || !trackClicks) && (
                <p className="text-[11px] text-muted-foreground">
                  {!trackOpens && !trackClicks ? 'Open & click tracking off'
                    : !trackOpens ? 'Open tracking off' : 'Click tracking off'} for this campaign
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Step</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Timing</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Sent</th>
                    {trackOpens && <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Opened</th>}
                    {trackClicks && <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Clicked</th>}
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
                        <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                          <span className="text-muted-foreground">
                            {step.order === 1
                              ? (delayLabel(step.delay_days, step.delay_hours) === 'Immediately' ? 'On enrollment' : `${delayLabel(step.delay_days, step.delay_hours)} after enrollment`)
                              : `${delayLabel(step.delay_days, step.delay_hours)} after step ${step.order - 1}`}
                          </span>
                          {step.waiting > 0 && (
                            <span className="ml-1 text-amber-600">· {step.waiting} waiting</span>
                          )}
                          {step.order > 1 && step.sent === 0 && step.waiting === 0 && (
                            <span className="ml-1 italic text-muted-foreground">· no leads reached yet</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums font-medium">{step.sent}</td>
                        {trackOpens && <td className="px-4 py-2.5 tabular-nums text-purple-600">{step.opened} <span className="text-xs text-muted-foreground">({pct(step.opened, step.sent)}%)</span></td>}
                        {trackClicks && <td className="px-4 py-2.5 tabular-nums text-blue-600">{step.clicked} <span className="text-xs text-muted-foreground">({pct(step.clicked, step.sent)}%)</span></td>}
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
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-xs tabular-nums">{variant.sent}</td>
                            {trackOpens && <td className="px-4 py-2 text-xs tabular-nums text-purple-600">{variant.opened} ({pct(variant.opened, variant.sent)}%)</td>}
                            {trackClicks && <td className="px-4 py-2 text-xs tabular-nums text-blue-600">{variant.clicked} ({pct(variant.clicked, variant.sent)}%)</td>}
                            <td className="px-4 py-2 text-xs tabular-nums text-green-600">{variant.replied} ({pct(variant.replied, variant.sent)}%)</td>
                            <td className="px-4 py-2 text-xs tabular-nums text-red-500">{variant.failed}</td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  ))}
                  {steps.length === 0 && (
                    <tr><td colSpan={6 + (trackOpens ? 1 : 0) + (trackClicks ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground text-sm">No steps yet</td></tr>
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
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Lead</th>
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
                        <p className="font-medium text-xs">{e.contact_name || <span className="text-muted-foreground italic">Deleted lead</span>}</p>
                        <p className="text-muted-foreground text-xs">{e.contact_email}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{e.current_step_order ?? '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {e.status === 'active' && e.next_send_at
                          ? <span title={formatDateTime(e.next_send_at)}>{fromNow(e.next_send_at)}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(e.enrolled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              No leads enrolled yet.
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
