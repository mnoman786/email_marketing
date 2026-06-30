'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { CampaignListItem, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { Plus, Search, Trash2, Megaphone, Play, Pause } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function CampaignsPage() {
  const qc = useQueryClient()
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
          <div className="p-6"><TableSkeleton rows={5} cols={6} /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create a campaign to send a single email or a multi-step drip to your contacts."
            action={{ label: 'Create Campaign', onClick: () => window.location.href = '/campaigns/new' }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lists</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Enrolled</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <Link href={`/campaigns/${campaign.id}`}>
                          <p className="font-medium hover:text-primary transition-colors">{campaign.name}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={campaign.status} /></td>
                      <td className="px-4 py-3">{campaign.step_count}</td>
                      <td className="px-4 py-3">{campaign.contact_list_count}</td>
                      <td className="px-4 py-3">{campaign.enrollment_count}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(campaign.created_at)}
                      </td>
                      <td className="px-4 py-3">
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
                          {campaign.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
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
