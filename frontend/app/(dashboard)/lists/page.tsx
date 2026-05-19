'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listsApi } from '@/lib/api'
import { ContactList, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { Plus, Search, Trash2, Users, Edit2, ListFilter } from 'lucide-react'
import toast from 'react-hot-toast'
import { ListFormDialog } from '@/components/contacts/list-form-dialog'

export default function ListsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editList, setEditList] = useState<ContactList | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['lists', { search }],
    queryFn: () => listsApi.getAll({ search }).then(r => r.data as PaginatedResponse<ContactList>),
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contact Lists</h1>
          <p className="text-sm text-muted-foreground">Organize contacts into targeted groups</p>
        </div>
        <Button onClick={() => { setEditList(null); setShowForm(true) }}>
          <Plus size={16} /> New List
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <Input
          placeholder="Search lists..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="p-4">
          <TableSkeleton rows={4} cols={4} />
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title="No lists yet"
          description="Create contact lists to organize your subscribers for targeted campaigns."
          action={{ label: 'Create List', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map(list => (
            <div key={list.id} className="rounded-xl border bg-card p-5 card-hover">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ListFilter className="text-primary" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{list.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {list.contact_count.toLocaleString()} active contacts
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { setEditList(list); setShowForm(true) }}
                  >
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(list.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>

              {list.description && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{list.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {list.total_contacts} total
                </span>
                <span>Created {formatDateTime(list.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
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
        description="This will remove the list but not the contacts. Are you sure?"
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
