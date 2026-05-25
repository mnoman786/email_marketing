'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignsApi } from '@/lib/api'
import { Campaign, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime, formatNumber } from '@/lib/utils'
import {
  Plus, Search, Trash2, Megaphone, Send, Pause, MoreHorizontal, Copy, BarChart3, Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function CampaignsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [sendId, setSendId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { search, status, page }],
    queryFn: () => campaignsApi.getAll({ search, status: status || undefined, page }).then(r => r.data as PaginatedResponse<Campaign>),
    refetchInterval: 10000,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => campaignsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign deleted'); setDeleteId(null) },
  })

  const sendMut = useMutation({
    mutationFn: (id: number) => campaignsApi.send(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign sending started!'); setSendId(null) },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
  })

  const dupMut = useMutation({
    mutationFn: (id: number) => campaignsApi.duplicate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign duplicated') },
  })

  const campaigns = data?.items || []
  const total = data?.count || 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Create and manage email campaigns</p>
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
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={6} /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Create your first campaign to start sending emails to your contacts."
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Recipients</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sent</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Failed</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaigns.map((campaign: any) => (
                    <tr key={campaign.id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <Link href={`/campaigns/${campaign.id}`}>
                          <div>
                            <p className="font-medium hover:text-primary transition-colors">{campaign.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{campaign.subject}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={campaign.status} />
                          {campaign.status === 'sending' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          )}
                        </div>
                        {campaign.status === 'scheduled' && campaign.scheduled_at && (
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock size={9} /> {formatDateTime(campaign.scheduled_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatNumber(campaign.total_recipients)}</td>
                      <td className="px-4 py-3">
                        <span className="text-green-600 dark:text-green-400">{formatNumber(campaign.sent_count)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={campaign.failed_count > 0 ? 'text-red-500' : 'text-muted-foreground'}>
                          {formatNumber(campaign.failed_count)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(campaign.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link href={`/campaigns/${campaign.id}`}>
                            <Button variant="ghost" size="icon-sm" title="View stats">
                              <BarChart3 size={14} />
                            </Button>
                          </Link>
                          {(campaign.status === 'draft' || campaign.status === 'failed') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Send now"
                              onClick={() => setSendId(campaign.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Send size={14} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Duplicate"
                            onClick={() => dupMut.mutate(campaign.id)}
                          >
                            <Copy size={14} />
                          </Button>
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
        open={!!sendId}
        onClose={() => setSendId(null)}
        onConfirm={() => sendId && sendMut.mutate(sendId)}
        title="Send Campaign"
        description="This will immediately start sending emails to all contacts in the selected lists."
        confirmLabel="Send Now"
        loading={sendMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Campaign"
        description="This campaign will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
