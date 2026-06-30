'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { ShieldBan, Plus, Trash2, Search } from 'lucide-react'
import toast from 'react-hot-toast'

interface Suppression {
  id: number
  email: string
  reason: 'unsubscribed' | 'bounced' | 'complained' | 'manual'
  note: string
  created_at: string
}

const REASON_VARIANT: Record<string, any> = {
  unsubscribed: 'warning',
  bounced: 'destructive',
  complained: 'destructive',
  manual: 'secondary',
}

export default function SuppressionsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [emails, setEmails] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['suppressions', page, search],
    queryFn: () => contactsApi.suppressions({ page, search: search || undefined })
      .then(r => r.data as PaginatedResponse<Suppression>),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['suppressions'] })

  const addMut = useMutation({
    mutationFn: () => {
      const list = emails.split(/[\s,;]+/).map(e => e.trim()).filter(Boolean)
      return contactsApi.addSuppressions(list)
    },
    onSuccess: (res) => { setEmails(''); invalidate(); toast.success(`${res.data.added} email(s) suppressed`) },
    onError: () => toast.error('Could not add — check the email format'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => contactsApi.deleteSuppressions([id]),
    onSuccess: () => { invalidate(); toast.success('Removed from suppression list'); setDeleteId(null) },
  })

  const items = data?.items || []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldBan size={22} /> Suppression List</h1>
        <p className="text-sm text-muted-foreground">
          Emails here are never sent to by any campaign or sequence — even if re-imported. Unsubscribes and bounces land here automatically.
        </p>
      </div>

      {/* Add */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <label className="text-sm font-medium">Add emails to suppress</label>
        <div className="flex gap-2">
          <Input
            value={emails}
            onChange={e => setEmails(e.target.value)}
            placeholder="paste emails — comma, space or newline separated"
            onKeyDown={e => { if (e.key === 'Enter' && emails.trim()) addMut.mutate() }}
          />
          <Button onClick={() => addMut.mutate()} loading={addMut.isPending} disabled={!emails.trim()}>
            <Plus size={15} /> Suppress
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search suppressed emails..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !items.length ? (
        <EmptyState
          icon={ShieldBan}
          title="No suppressed emails"
          description="Unsubscribes, bounces, and complaints are added here automatically. You can also add emails manually above."
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Added</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(s => (
                <tr key={s.id} className="table-row-hover">
                  <td className="px-4 py-3 font-medium">{s.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={REASON_VARIANT[s.reason] || 'secondary'}>{s.reason}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(s.id)} title="Remove">
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.count > items.length && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{data.count} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={items.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Remove from suppression list"
        description="This email will be eligible to receive campaigns again. Are you sure?"
        confirmLabel="Remove"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
