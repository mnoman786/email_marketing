'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs } from '@/components/ui/tabs'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PageSkeleton } from '@/components/shared/loading-skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { TablePagination } from '@/components/shared/table-pagination'
import { formatDateTime, cn } from '@/lib/utils'
import {
  ArrowLeft, Play, Pause, Pencil, Trash2, BarChart3, Users, RefreshCw, Clock, Send, CheckCircle2,
  Mail, ReplyAll, AlertTriangle, Eye, MousePointerClick, FlaskConical,
  TrendingUp, TrendingDown, Minus, Trophy, ThumbsDown, ThumbsUp, ShieldAlert, Filter,
  ExternalLink, Inbox, MessageSquareText,
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
  const [selectedStep, setSelectedStep] = useState<any>(null)
  const [enrollmentsPage, setEnrollmentsPage] = useState(1)
  const ENROLLMENTS_PAGE_SIZE = 25

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
    // Only an active campaign's numbers change between polls — a paused/
    // draft/completed campaign would otherwise poll this forever for no reason.
    refetchInterval: campaign?.status === 'active' ? 10000 : false,
  })

  const { data: enrollments } = useQuery({
    queryKey: ['campaign-enrollments', id, enrollmentsPage],
    queryFn: () => campaignsApi.enrollments(Number(id), { page_size: ENROLLMENTS_PAGE_SIZE, page: enrollmentsPage }).then(r => r.data),
    enabled: !!id && tab === 'leads',
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
  const replySentiment = stats?.reply_sentiment || null
  const funnel = stats?.funnel || null
  const performers = stats?.performers || null
  const deliverability = stats?.deliverability || null
  const smtpPerformance: any[] = stats?.smtp_performance || []
  const trendComparison = stats?.trend_comparison || null
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

      {/* Tabs */}
      <div className="border-b">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'analytics', label: 'Analytics', icon: BarChart3 },
            { key: 'leads', label: 'Leads', icon: Users, badge: totalEnrolled },
          ]}
        />
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

          {/* Insights */}
          <div className="space-y-4">
            <p className="font-semibold text-sm flex items-center gap-1.5"><Filter size={14} /> Insights</p>

            {/* Funnel */}
            {funnel && funnel.sent > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Conversion Funnel</p>
                <div className="space-y-2">
                  {([
                    { label: 'Sent', value: funnel.sent, of: funnel.sent, tone: 'bg-muted-foreground/70' },
                    { label: 'Opened', value: funnel.opened, of: funnel.sent, tone: 'bg-purple-500', dropLabel: `${funnel.drop_off.sent_to_opened}% of sent` },
                    { label: 'Clicked', value: funnel.clicked, of: funnel.sent, tone: 'bg-blue-500', dropLabel: `${funnel.drop_off.opened_to_clicked}% of opened` },
                    { label: 'Replied', value: funnel.replied, of: funnel.sent, tone: 'bg-green-500', dropLabel: `${funnel.drop_off.clicked_to_replied}% of clicked` },
                  ] as const).map(row => {
                    const widthPct = funnel.sent > 0 ? Math.max(2, Math.round((row.value / funnel.sent) * 100)) : 0
                    return (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-14 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                        <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-md flex items-center px-2 transition-all', row.tone)} style={{ width: `${widthPct}%` }}>
                            <span className="text-[11px] font-semibold text-white tabular-nums">{row.value.toLocaleString()}</span>
                          </div>
                        </div>
                        {'dropLabel' in row && row.dropLabel && (
                          <span className="w-28 shrink-0 text-[11px] text-muted-foreground text-right">{row.dropLabel}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance highlights */}
              {performers && (performers.best_step || performers.best_variant) && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Performance Highlights</p>
                  {[
                    { row: performers.best_variant, kind: 'variant', good: true, label: 'Best variant' },
                    { row: performers.worst_variant, kind: 'variant', good: false, label: 'Worst variant' },
                    { row: performers.best_step, kind: 'step', good: true, label: 'Best step' },
                    { row: performers.worst_step, kind: 'step', good: false, label: 'Worst step' },
                  ].filter(x => x.row).map(({ row, kind, good, label }) => (
                    <div key={label} className="flex items-start gap-2.5">
                      {good
                        ? <Trophy size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        : <ThumbsDown size={14} className="text-muted-foreground mt-0.5 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {label}{kind === 'variant' && ` (Step ${row.step_order} · Variant ${row.label})`}
                        </p>
                        <p className="text-sm font-medium truncate">{row.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.sent} sent · <span className="text-purple-600">{row.open_rate}% opened</span> · <span className="text-green-600">{row.reply_rate}% replied</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Week-over-week trend */}
              {trendComparison && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This Week vs Last Week</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['sent', 'opened', 'clicked', 'replied'] as const).map(metric => {
                      const change = trendComparison.change[metric]
                      const Icon = change === null ? Minus : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
                      const tone = change === null || change === 0 ? 'text-muted-foreground' : change > 0 ? 'text-green-600' : 'text-red-500'
                      return (
                        <div key={metric} className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground capitalize">{metric}</p>
                            <p className="text-lg font-bold tabular-nums">{trendComparison.this_week[metric].toLocaleString()}</p>
                          </div>
                          <span className={cn('flex items-center gap-0.5 text-xs font-medium tabular-nums', tone)}>
                            <Icon size={12} />
                            {change === null ? 'new' : `${change > 0 ? '+' : ''}${change}%`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Reply sentiment — positive vs negative replies, as a share of sent.
                'Unclassified' isn't shown here: a Thread exists for every enrolled
                contact once we've emailed them, so it just means "hasn't replied /
                hasn't been triaged yet", not a real sentiment bucket. */}
            {replySentiment && (replySentiment.positive > 0 || replySentiment.negative > 0) && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <MessageSquareText size={13} /> Reply Sentiment
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp size={11} className="text-emerald-600" /> Positive</p>
                    <p className="text-xl font-bold tabular-nums mt-0.5 text-emerald-600">{replySentiment.positive_rate}%</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{replySentiment.positive.toLocaleString()} interested / meeting booked</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsDown size={11} className="text-red-500" /> Negative</p>
                    <p className="text-xl font-bold tabular-nums mt-0.5 text-red-500">{replySentiment.negative_rate}%</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{replySentiment.negative.toLocaleString()} not interested</p>
                  </div>
                </div>
              </div>
            )}

            {/* Deliverability health */}
            {deliverability && deliverability.attempted > 0 && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldAlert size={13} /> Deliverability Health
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    { label: 'Failed rate', value: deliverability.failed_rate, count: deliverability.failed, warn: 5, danger: 10 },
                    { label: 'Bounce rate', value: deliverability.bounce_rate, count: deliverability.bounced, warn: 3, danger: 8 },
                    { label: 'Complaint rate', value: deliverability.complaint_rate, count: deliverability.complained, warn: 0.1, danger: 0.5 },
                  ] as const).map(m => {
                    const tone = m.value >= m.danger ? 'text-red-500' : m.value >= m.warn ? 'text-amber-600' : 'text-green-600'
                    return (
                      <div key={m.label} className="rounded-lg border bg-muted/30 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{m.label}</p>
                        <p className={cn('text-xl font-bold tabular-nums mt-0.5', tone)}>{m.value}%</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.count.toLocaleString()} of {deliverability.attempted.toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>
                {deliverability.top_errors.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] text-muted-foreground mb-1.5">Most common failures</p>
                    <div className="space-y-1">
                      {deliverability.top_errors.map((e: any) => (
                        <div key={e.message} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-muted-foreground">{e.message}</span>
                          <span className="shrink-0 font-medium tabular-nums">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {smtpPerformance.length > 1 && (
                  <div className="pt-2 border-t">
                    <p className="text-[11px] text-muted-foreground mb-1.5">Per sending account</p>
                    <div className="space-y-1.5">
                      {smtpPerformance.map(a => (
                        <div key={a.smtp_account_id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{a.from_email}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {a.sent} sent · {a.open_rate}% opened · <span className={a.bounce_rate >= 5 ? 'text-red-500' : ''}>{a.bounce_rate}% bounced</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                    <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end group">
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
            <TableScroll>
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TH>Step</TH>
                    <TH>Subject</TH>
                    <TH>Timing</TH>
                    <TH>Sent</TH>
                    {trackOpens && <TH>Opened</TH>}
                    {trackClicks && <TH>Clicked</TH>}
                    <TH>Replied</TH>
                    <TH>Failed</TH>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {steps.map((step: any) => (
                    <TR
                      key={step.step_id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedStep(step)}
                    >
                      <TD className="py-2.5 font-medium whitespace-nowrap">Step {step.order}</TD>
                      <TD className="py-2.5 text-muted-foreground truncate max-w-xs">
                        <span className="truncate">{step.subject}</span>
                        {(step.variants || []).length > 1 && (
                          <span className="ml-1.5 badge bg-primary/10 text-primary text-[10px]">{step.variants.length} variants</span>
                        )}
                      </TD>
                      <TD className="py-2.5 whitespace-nowrap text-xs">
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
                      </TD>
                      <TD className="py-2.5 tabular-nums font-medium">{step.sent}</TD>
                      {trackOpens && <TD className="py-2.5 tabular-nums text-purple-600">{step.opened} <span className="text-xs text-muted-foreground">({pct(step.opened, step.sent)}%)</span></TD>}
                      {trackClicks && <TD className="py-2.5 tabular-nums text-blue-600">{step.clicked} <span className="text-xs text-muted-foreground">({pct(step.clicked, step.sent)}%)</span></TD>}
                      <TD className="py-2.5 tabular-nums text-green-600">{step.replied} <span className="text-xs text-muted-foreground">({pct(step.replied, step.sent)}%)</span></TD>
                      <TD className="py-2.5 tabular-nums text-red-500">{step.failed}</TD>
                    </TR>
                  ))}
                  {steps.length === 0 && (
                    <tr><td colSpan={6 + (trackOpens ? 1 : 0) + (trackClicks ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground text-sm">No steps yet</td></tr>
                  )}
                </TableBody>
              </Table>
            </TableScroll>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link href={`/unibox?campaign_id=${campaign.id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Inbox size={14} /> View replies in Unibox <ExternalLink size={12} />
            </Link>
          </div>
          <TableContainer>
          {enrollments?.items?.length > 0 ? (
            <TableScroll>
              <Table>
                <TableHead>
                  <TableHeaderRow>
                    <TH>Lead</TH>
                    <TH>Current Step</TH>
                    <TH>Status</TH>
                    <TH>Next Send</TH>
                    <TH>Enrolled At</TH>
                  </TableHeaderRow>
                </TableHead>
                <TableBody>
                  {enrollments.items.map((e: any) => (
                    <TR key={e.id}>
                      <TD className="py-2.5">
                        <p className="font-medium text-xs">{e.contact_name || <span className="text-muted-foreground italic">Deleted lead</span>}</p>
                        <p className="text-muted-foreground text-xs">{e.contact_email}</p>
                      </TD>
                      <TD className="py-2.5 text-xs">{e.current_step_order ?? '—'}</TD>
                      <TD className="py-2.5"><StatusBadge status={e.status} /></TD>
                      <TD className="py-2.5 text-xs text-muted-foreground">
                        {e.status === 'active' && e.next_send_at
                          ? <span title={formatDateTime(e.next_send_at)}>{fromNow(e.next_send_at)}</span>
                          : '—'}
                      </TD>
                      <TD className="py-2.5 text-xs text-muted-foreground">{formatDateTime(e.enrolled_at)}</TD>
                    </TR>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              No leads enrolled yet.
            </div>
          )}
          {enrollments && enrollments.count > 0 && (
            <TablePagination
              page={enrollmentsPage}
              pageSize={ENROLLMENTS_PAGE_SIZE}
              total={enrollments.count}
              onPageChange={setEnrollmentsPage}
            />
          )}
          </TableContainer>
        </div>
      )}

      {/* Step detail — full content + every variant + timing, all in one place */}
      <Dialog open={!!selectedStep} onOpenChange={(open) => { if (!open) setSelectedStep(null) }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          {selectedStep && (() => {
            const step = selectedStep
            const variants: any[] = step.variants || []
            const hasVariants = variants.length > 0
            const activeVariantCount = variants.filter(v => v.is_active).length
            const totalWeight = variants.reduce((sum, v) => sum + Math.max(v.weight ?? 0, 0), 0)
            const timingLabel = step.order === 1
              ? (delayLabel(step.delay_days, step.delay_hours) === 'Immediately' ? 'Sends on enrollment' : `Sends ${delayLabel(step.delay_days, step.delay_hours)} after enrollment`)
              : `Sends ${delayLabel(step.delay_days, step.delay_hours)} after step ${step.order - 1}`

            const StatTile = ({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: number; sub?: string; tone?: string }) => (
              <div className="flex-1 min-w-[92px] rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  <Icon size={11} /> {label}
                </div>
                <p className={cn('text-lg font-bold tabular-nums mt-0.5', tone)}>{value.toLocaleString()}</p>
                {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
              </div>
            )

            const renderStats = (row: any) => (
              <div className="flex flex-wrap gap-2">
                <StatTile icon={Send} label="Sent" value={row.sent} />
                {trackOpens && <StatTile icon={Eye} label="Opened" value={row.opened} sub={`${pct(row.opened, row.sent)}%`} tone="text-purple-600" />}
                {trackClicks && <StatTile icon={MousePointerClick} label="Clicked" value={row.clicked} sub={`${pct(row.clicked, row.sent)}%`} tone="text-blue-600" />}
                <StatTile icon={ReplyAll} label="Replied" value={row.replied} sub={`${pct(row.replied, row.sent)}%`} tone="text-green-600" />
                <StatTile icon={AlertTriangle} label="Failed" value={row.failed} tone="text-red-500" />
              </div>
            )

            const Preview = ({ html }: { html: string }) => (
              <div className="rounded-lg overflow-hidden border bg-white shadow-inner">
                <iframe
                  srcDoc={`<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111;padding:20px;margin:0;">${
                    html || '<p style="color:#aaa">No content yet.</p>'
                  }</body></html>`}
                  className="w-full h-64 border-none"
                  title="Email preview"
                />
              </div>
            )

            return (
              <>
                <div className="px-6 py-5 border-b bg-linear-to-br from-primary/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {step.order}
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-base">Step {step.order}</DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <Clock size={11} className="shrink-0" /> {timingLabel}
                        {step.waiting > 0 && (
                          <span className="badge bg-amber-100 text-amber-700 text-[10px]">{step.waiting} waiting</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {renderStats(step)}

                  {!hasVariants ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{step.subject}</p>
                      <Preview html={step.html_content} />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <FlaskConical size={12} /> {variants.length} Variants
                        {step.auto_optimize && <span className="badge bg-primary/10 text-primary text-[10px] normal-case tracking-normal">Auto-optimize on</span>}
                      </p>
                      {variants.map(v => {
                        const isWinner = step.auto_optimize && activeVariantCount === 1 && v.is_active
                        const sharePct = totalWeight > 0 ? Math.round((Math.max(v.weight ?? 0, 0) / totalWeight) * 100) : 0
                        return (
                          <div key={v.variant_id} className={cn(
                            'rounded-xl border overflow-hidden transition-opacity',
                            isWinner ? 'border-amber-300 ring-1 ring-amber-200 dark:ring-amber-900/40' : '',
                            !v.is_active && 'opacity-50'
                          )}>
                            <div className="px-4 py-3 bg-muted/30 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{v.label}</span>
                                  <span className="text-sm font-medium truncate">{v.subject}</span>
                                  {isWinner && <span className="badge bg-amber-100 text-amber-700 text-[10px] shrink-0">🏆 Winner</span>}
                                  {!v.is_active && <span className="badge bg-muted text-muted-foreground text-[10px] shrink-0">Disabled</span>}
                                </div>
                                <span className="text-xs font-medium text-muted-foreground shrink-0 tabular-nums">{sharePct}% traffic</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${sharePct}%` }} />
                              </div>
                            </div>
                            <div className="p-4 space-y-3">
                              {renderStats(v)}
                              <Preview html={v.html_content} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

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
