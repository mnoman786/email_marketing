'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tagsApi } from '@/lib/api'
import { Tag } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Edit2, Tags as TagsIcon, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { TagFormDialog, TAG_COLOR_CLASSES } from '@/components/contacts/tag-form-dialog'

export default function TagsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editTag, setEditTag] = useState<Tag | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags-all'],
    queryFn: () => tagsApi.getAll().then(r => r.data as Tag[]),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags-all'] })
      toast.success('Tag deleted')
      setDeleteId(null)
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tags</h1>
          <p className="text-sm text-muted-foreground">Free-form labels for segmenting leads — a lead can carry several at once</p>
        </div>
        <Button onClick={() => { setEditTag(null); setShowForm(true) }}>
          <Plus size={16} /> New Tag
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={4} cols={3} /></div>
      ) : !tags || tags.length === 0 ? (
        <EmptyState
          icon={TagsIcon}
          title="No tags yet"
          description="Create tags to label leads by behavior or status — e.g. Interested, VIP, Decision Maker — and use them as triggers/conditions in Workflows."
          action={{ label: 'New Tag', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <div key={tag.id} className="rounded-xl border bg-card p-5 card-hover">
              <div className="flex items-start justify-between">
                <span className={cn('badge text-sm font-medium px-3 py-1', TAG_COLOR_CLASSES[tag.color] || TAG_COLOR_CLASSES.gray)}>
                  {tag.name}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditTag(tag); setShowForm(true) }}>
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(tag.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users size={12} /> {tag.contact_count.toLocaleString()} leads
                </span>
                <span>Created {formatDateTime(tag.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <TagFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        tag={editTag}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['tags-all'] }); setShowForm(false) }}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Tag"
        description="This removes the tag from every lead it's applied to. Are you sure?"
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
