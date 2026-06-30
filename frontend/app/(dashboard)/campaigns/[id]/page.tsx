'use client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageSkeleton } from '@/components/shared/loading-skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { formatDateTime } from '@/lib/utils'
import { ArrowLeft, Play, Pause, Pencil, Users, Mail, MousePointerClick, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function CampaignDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const qc = useQueryClient()
  const [showDelete, setShowDelete] = useState(false)

  const { data: campaign, isLoading } = useQuery({
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
    queryFn: () => campaignsApi.enrollments(Number(id), { page_size: 10 }).then(r => r.data),
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
  if (!campaign) return <div className="p-6">Campaign not found</div>

  const totalEnrolled = stats?.total_enrolled || 0
  const counts = stats?.enrollment_counts || {}

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border bg-card p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/campaigns')} className="shrink-0">
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold truncate">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{campaign.steps.length} step(s)</p>
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
          {campaign.status === 'draft' && (
            <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Enrolled', value: totalEnrolled, icon: Users, color: 'text-blue-600' },
          { label: 'Active', value: counts.active || 0, icon: Mail, color: 'text-amber-500' },
          { label: 'Completed', value: counts.completed || 0, icon: Mail, color: 'text-green-600' },
          { label: 'Stopped (engaged)', value: counts.stopped || 0, icon: MousePointerClick, color: 'text-purple-600' },
          { label: 'Unsubscribed/Bounced', value: (counts.unsubscribed || 0) + (counts.bounced || 0), icon: Users, color: 'text-red-500' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <kpi.icon className={kpi.color} size={18} />
              </div>
              <p className={`text-3xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Step funnel */}
      <Card>
        <CardHeader><CardTitle>Step Funnel</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Step</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Subject</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Sent</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Failed</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Opened</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Clicked</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Replied</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(stats?.steps || []).map((step: any) => (
                <tr key={step.step_id}>
                  <td className="px-4 py-2 font-medium">Step {step.order}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{step.subject}</td>
                  <td className="px-4 py-2 text-green-600">{step.sent}</td>
                  <td className="px-4 py-2 text-red-500">{step.failed}</td>
                  <td className="px-4 py-2 text-purple-600">{step.opened}</td>
                  <td className="px-4 py-2 text-blue-600">{step.clicked}</td>
                  <td className="px-4 py-2 text-green-600">{step.replied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Enrollments */}
      {enrollments?.items?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Enrolled Contacts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Current Step</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Next Send</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enrollments.items.map((e: any) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <p className="font-medium text-xs">{e.contact_name || <span className="text-muted-foreground italic">Deleted contact</span>}</p>
                      <p className="text-muted-foreground text-xs">{e.contact_email}</p>
                    </td>
                    <td className="px-4 py-2 text-xs">{e.current_step_order ?? '—'}</td>
                    <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDateTime(e.next_send_at)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{formatDateTime(e.enrolled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
