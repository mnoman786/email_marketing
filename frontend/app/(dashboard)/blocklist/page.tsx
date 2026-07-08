'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { TableContainer, TableScroll, Table, TableHead, TableBody, TableHeaderRow, TH, TR, TD } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TablePagination } from '@/components/shared/table-pagination'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { ShieldBan, Plus, Trash2 } from 'lucide-react'
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

  const { data, isLoading, isError, refetch } = useQuery({
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
      <SearchInput
        wrapperClassName="max-w-sm"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }}
        placeholder="Search suppressed emails..."
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : isError ? (
        <TableContainer><ErrorState description="Could not load the suppression list. Check your connection and try again." onRetry={() => refetch()} /></TableContainer>
      ) : !items.length ? (
        <EmptyState
          icon={ShieldBan}
          title="No suppressed emails"
          description="Unsubscribes, bounces, and complaints are added here automatically. You can also add emails manually above."
        />
      ) : (
        <TableContainer>
          <TableScroll>
            <Table>
              <TableHead>
                <TableHeaderRow>
                  <TH>Email</TH>
                  <TH>Reason</TH>
                  <TH>Added</TH>
                  <TH className="w-16" />
                </TableHeaderRow>
              </TableHead>
              <TableBody>
                {items.map(s => (
                  <TR key={s.id}>
                    <TD className="font-medium">{s.email}</TD>
                    <TD>
                      <Badge variant={REASON_VARIANT[s.reason] || 'secondary'}>{s.reason}</Badge>
                    </TD>
                    <TD className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(s.created_at)}</TD>
                    <TD>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(s.id)} title="Remove">
                        <Trash2 size={14} />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
          <TablePagination page={page} pageSize={50} total={data?.count || 0} onPageChange={setPage} />
        </TableContainer>
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
