'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api'
import { EmailTemplate, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { Plus, Search, Trash2, Mail, Copy, Edit, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function TemplatesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['templates', { search }],
    queryFn: () => templatesApi.getAll({ search }).then(r => r.data as PaginatedResponse<EmailTemplate>),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => templatesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast.success('Template deleted'); setDeleteId(null) },
  })

  const dupMut = useMutation({
    mutationFn: (id: number) => templatesApi.duplicate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); toast.success('Template duplicated') },
  })

  const templates = data?.items || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Email Templates</h1>
          <p className="text-sm text-muted-foreground">Design reusable email templates</p>
        </div>
        <Link href="/templates/new">
          <Button><Plus size={16} /> New Template</Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No templates yet"
          description="Create reusable email templates with HTML editor and variables."
          action={{ label: 'Create Template', onClick: () => window.location.href = '/templates/new' }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => (
            <div key={tpl.id} className="rounded-xl border bg-card overflow-hidden card-hover">
              {/* Preview strip */}
              <div className="h-28 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 flex items-center justify-center">
                <Mail className="text-blue-300 dark:text-blue-700" size={36} />
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm">{tpl.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tpl.subject}</p>
                  </div>
                  <Badge variant={tpl.is_active ? 'success' : 'secondary'}>
                    {tpl.is_active ? 'Active' : 'Draft'}
                  </Badge>
                </div>

                {tpl.variables && tpl.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tpl.variables.slice(0, 3).map(v => (
                      <span key={v} className="badge bg-muted text-muted-foreground text-xs">&#123;&#123;{v}&#125;&#125;</span>
                    ))}
                    {tpl.variables.length > 3 && (
                      <span className="badge bg-muted text-muted-foreground text-xs">+{tpl.variables.length - 3}</span>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  Updated {formatDateTime(tpl.updated_at)}
                </p>

                <div className="flex gap-1 mt-3">
                  <Link href={`/templates/${tpl.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Edit size={13} /> Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => dupMut.mutate(tpl.id)}
                    loading={dupMut.isPending}
                    title="Duplicate"
                  >
                    <Copy size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(tpl.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Template"
        description="This template will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
