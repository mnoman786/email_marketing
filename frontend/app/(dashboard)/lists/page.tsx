'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listsApi } from '@/lib/api'
import { ContactList, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { TablePagination } from '@/components/shared/table-pagination'
import { formatDateTime, cn } from '@/lib/utils'
import { Plus, Trash2, Users, Pencil, ListFilter } from 'lucide-react'
import toast from 'react-hot-toast'
import { ListFormDialog } from '@/components/contacts/list-form-dialog'

type SortKey = 'name' | 'newest' | 'oldest' | 'leads'

// Rotating soft-tint palette for the icon tile, keyed by card position — gives
// the grid some visual rhythm without needing per-list color data.
const TILE_COLORS = [
  'bg-primary/10 text-primary',
  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
]

export default function ListsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editList, setEditList] = useState<ContactList | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['lists', { search, page }],
    queryFn: () => listsApi.getAll({ search, page }).then(r => r.data as PaginatedResponse<ContactList>),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => listsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] })
      toast.success('List deleted')
      setDeleteId(null)
    },
  })

  const lists = data?.items || []

  const sortedLists = useMemo(() => {
    const copy = [...lists]
    switch (sortBy) {
      case 'name': return copy.sort((a, b) => a.name.localeCompare(b.name))
      case 'oldest': return copy.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      case 'leads': return copy.sort((a, b) => b.contact_count - a.contact_count)
      default: return copy.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    }
  }, [lists, sortBy])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lead Lists</h1>
          <p className="text-sm text-muted-foreground">Organize leads into targeted groups</p>
        </div>
        <Button onClick={() => { setEditList(null); setShowForm(true) }}>
          <Plus size={16} /> New List
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          placeholder="Search lists..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          wrapperClassName="max-w-sm flex-1 min-w-48"
        />
        <NativeSelect
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortKey)}
          wrapperClassName="w-44"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name (A–Z)</option>
          <option value="leads">Most leads</option>
        </NativeSelect>
      </div>

      {isLoading ? (
        <div className="p-4">
          <TableSkeleton rows={4} cols={4} />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : lists.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title={search ? 'No lists match your search' : 'No lists yet'}
          description={search ? 'Try a different search term.' : 'Create lead lists to organize your leads for targeted campaigns.'}
          action={search ? undefined : { label: 'Create List', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedLists.map((list, i) => {
            return (
              <div
                key={list.id}
                className="group relative rounded-xl border bg-card p-5 card-hover cursor-pointer"
                onClick={() => router.push(`/leads?list_id=${list.id}`)}
                title={`View leads in "${list.name}"`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', TILE_COLORS[i % TILE_COLORS.length])}>
                      <ListFilter size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold line-clamp-1 break-all" title={list.name}>{list.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {list.contact_count.toLocaleString()} active leads
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Edit list"
                      onClick={() => { setEditList(list); setShowForm(true) }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      title="Delete list"
                      onClick={() => setDeleteId(list.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {list.description ? (
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{list.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/60 mt-3 italic">No description</p>
                )}

                <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {list.total_contacts.toLocaleString()} total
                  </span>
                  <span>Created {formatDateTime(list.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(data?.count || 0) > 20 && (
        <TablePagination
          page={page}
          pageSize={20}
          total={data?.count || 0}
          onPageChange={setPage}
          className="border rounded-xl bg-card"
        />
      )}

      <ListFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        list={editList}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['lists'] }); setShowForm(false) }}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete List"
        description="This will remove the list but not the leads. Are you sure?"
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
