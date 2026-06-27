'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sequencesApi } from '@/lib/api'
import { SequenceListItem, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { Plus, Search, Trash2, Workflow, Play, Pause } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function SequencesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sequences', { search, status, page }],
    queryFn: () => sequencesApi.getAll({ search, status: status || undefined, page }).then(r => r.data as PaginatedResponse<SequenceListItem>),
    refetchInterval: 10000,
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => sequencesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sequences'] }); toast.success('Sequence deleted'); setDeleteId(null) },
  })

  const activateMut = useMutation({
    mutationFn: (id: number) => sequencesApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sequences'] }); toast.success('Sequence activated') },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to activate'),
  })

  const pauseMut = useMutation({
    mutationFn: (id: number) => sequencesApi.pause(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sequences'] }); toast.success('Sequence paused') },
  })

  const resumeMut = useMutation({
    mutationFn: (id: number) => sequencesApi.resume(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sequences'] }); toast.success('Sequence resumed') },
  })

  const sequences = data?.items || []
  const total = data?.count || 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sequences</h1>
          <p className="text-sm text-muted-foreground">Multi-step drip sequences for cold outreach</p>
        </div>
        <Link href="/sequences/new">
          <Button><Plus size={16} /> New Sequence</Button>
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            placeholder="Search sequences..."
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
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No sequences yet"
            description="Create a multi-step sequence to automatically follow up with your contacts over time."
            action={{ label: 'Create Sequence', onClick: () => window.location.href = '/sequences/new' }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Sequence</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lists</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Enrolled</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sequences.map((sequence) => (
                    <tr key={sequence.id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <Link href={`/sequences/${sequence.id}`}>
                          <p className="font-medium hover:text-primary transition-colors">{sequence.name}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={sequence.status} /></td>
                      <td className="px-4 py-3">{sequence.step_count}</td>
                      <td className="px-4 py-3">{sequence.contact_list_count}</td>
                      <td className="px-4 py-3">{sequence.enrollment_count}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateTime(sequence.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {(sequence.status === 'draft' || sequence.status === 'paused') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={sequence.status === 'draft' ? 'Activate' : 'Resume'}
                              onClick={() => sequence.status === 'draft' ? activateMut.mutate(sequence.id) : resumeMut.mutate(sequence.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Play size={14} />
                            </Button>
                          )}
                          {sequence.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Pause"
                              onClick={() => pauseMut.mutate(sequence.id)}
                            >
                              <Pause size={14} />
                            </Button>
                          )}
                          {sequence.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(sequence.id)}
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
              <p className="text-sm text-muted-foreground">{total} total sequences</p>
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
        title="Delete Sequence"
        description="This sequence and its steps will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
