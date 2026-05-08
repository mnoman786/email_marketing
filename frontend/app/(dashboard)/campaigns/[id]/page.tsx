'use client'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi, analyticsApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSkeleton } from '@/components/shared/loading-skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { ArrowLeft, Send, Pause, XCircle, RefreshCw, Users, Mail, AlertTriangle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b']

export default function CampaignDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const qc = useQueryClient()
  const [showSend, setShowSend] = useState(false)
  const [showCancel, setShowCancel] = useState(false)

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(Number(id)).then(r => r.data as Campaign),
    refetchInterval: (query) => {
      const data = query.state.data as Campaign | undefined
      return data?.status === 'sending' ? 5000 : false
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => campaignsApi.stats(Number(id)).then(r => r.data),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const { data: logs } = useQuery({
    queryKey: ['campaign-logs', id],
    queryFn: () => analyticsApi.logs({ campaign: id, page_size: 10 }).then(r => r.data),
    enabled: !!id,
  })

  const sendMut = useMutation({
    mutationFn: () => campaignsApi.send(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); toast.success('Campaign sending started!'); setShowSend(false) },
  })

  const cancelMut = useMutation({
    mutationFn: () => campaignsApi.cancel(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); toast.success('Campaign cancelled'); setShowCancel(false) },
  })

  if (isLoading) return <PageSkeleton />
  if (!campaign) return <div className="p-6">Campaign not found</div>

  const smtpPerfData = stats?.smtp_performance || []
  const statusData = [
    { name: 'Sent', value: campaign.sent_count },
    { name: 'Failed', value: campaign.failed_count },
    { name: 'Pending', value: Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.failed_count) },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/campaigns')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{campaign.subject}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'draft' || campaign.status === 'failed' ? (
            <Button onClick={() => setShowSend(true)}>
              <Send size={15} /> Send Now
            </Button>
          ) : null}
          {campaign.status !== 'sent' && campaign.status !== 'cancelled' && (
            <Button variant="destructive" onClick={() => setShowCancel(true)}>
              <XCircle size={15} /> Cancel
            </Button>
          )}
          <Link href={`/campaigns/${id}/edit`}>
            {campaign.status === 'draft' && (
              <Button variant="outline">Edit</Button>
            )}
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Recipients', value: formatNumber(campaign.total_recipients), icon: Users, color: 'text-blue-600' },
          { label: 'Delivered', value: formatNumber(campaign.sent_count), icon: CheckCircle, color: 'text-green-600', sub: formatPercent(campaign.delivery_rate) },
          { label: 'Failed', value: formatNumber(campaign.failed_count), icon: AlertTriangle, color: 'text-red-500', sub: formatPercent(campaign.failure_rate) },
          { label: 'Opens', value: formatNumber(campaign.open_count), icon: Mail, color: 'text-purple-600' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={kpi.color} size={18} />
              </div>
              <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {campaign.total_recipients > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Sending Progress</span>
              <span className="text-muted-foreground">
                {campaign.sent_count + campaign.failed_count} / {campaign.total_recipients}
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${campaign.delivery_rate}%` }}
              />
              <div
                className="h-full bg-red-400 transition-all"
                style={{ width: `${campaign.failure_rate}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Delivered {formatPercent(campaign.delivery_rate)}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Failed {formatPercent(campaign.failure_rate)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SMTP Performance */}
        {smtpPerfData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>SMTP Account Performance</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={smtpPerfData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="smtp_name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar dataKey="sent" name="Sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Status distribution */}
        {statusData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Email Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={false} labelLine={false}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent logs */}
      {logs?.results?.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Send Logs</CardTitle>
            <Link href={`/analytics?campaign=${id}`}>
              <Button variant="outline" size="sm">View All Logs</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">SMTP</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.results.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <p className="font-medium text-xs">{log.contact_name}</p>
                      <p className="text-muted-foreground text-xs">{log.contact_email}</p>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{log.smtp_name || '—'}</td>
                    <td className="px-4 py-2"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDateTime(log.sent_at || log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Campaign info */}
      <Card>
        <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Created', value: formatDateTime(campaign.created_at) },
            { label: 'Started', value: formatDateTime(campaign.started_at) },
            { label: 'Completed', value: formatDateTime(campaign.completed_at) },
            { label: 'Scheduled', value: formatDateTime(campaign.scheduled_at) },
            { label: 'Target Lists', value: campaign.contact_lists_detail?.map((l: any) => l.name).join(', ') || '—' },
            { label: 'Template', value: campaign.template_detail?.name || 'Custom' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="font-medium mt-0.5">{value || '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showSend}
        onClose={() => setShowSend(false)}
        onConfirm={() => sendMut.mutate()}
        title="Send Campaign"
        description={`Start sending "${campaign.name}" to all active contacts in the selected lists?`}
        confirmLabel="Send Now"
        loading={sendMut.isPending}
      />
      <ConfirmDialog
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={() => cancelMut.mutate()}
        title="Cancel Campaign"
        description="This will stop the campaign. Sent emails cannot be recalled."
        confirmLabel="Cancel Campaign"
        destructive
        loading={cancelMut.isPending}
      />
    </div>
  )
}
