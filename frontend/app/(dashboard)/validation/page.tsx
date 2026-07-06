'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { validationApi } from '@/lib/api'
import { ImportBatch, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { ShieldCheck, Trash2, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { ValidationImportDialog } from '@/components/contacts/validation-import-dialog'

function StatusPill({ batch }: { batch: ImportBatch }) {
  if (batch.status === 'verifying') {
    return (
      <span className="badge bg-amber-100 text-amber-700 text-xs flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Verifying {batch.percent}%
      </span>
    )
  }
  if (batch.status === 'promoted') {
    return (
      <span className="badge bg-green-100 text-green-700 text-xs flex items-center gap-1">
        <CheckCircle2 size={11} /> {batch.promoted_count} sent to leads
      </span>
    )
  }
  return <span className="badge bg-blue-100 text-blue-700 text-xs">Ready to review</span>
}

export default function ValidationPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [showImport, setShowImport] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['validation-batches'],
    queryFn: () => validationApi.batches().then(r => r.data as PaginatedResponse<ImportBatch>),
    // Keep counts/progress fresh while any batch is still verifying.
    refetchInterval: (query) => {
      const items = (query.state.data as PaginatedResponse<ImportBatch> | undefined)?.items
      return items?.some(b => b.status === 'verifying') ? 2000 : false
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => validationApi.deleteBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validation-batches'] })
      toast.success('Batch deleted')
      setDeleteId(null)
    },
  })

  const batches = data?.items || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Email Validation</h1>
          <p className="text-sm text-muted-foreground">
            Upload a lead list, verify every mailbox, then push the valid ones to your leads.
          </p>
        </div>
        <Button onClick={() => setShowImport(true)}>
          <ShieldCheck size={16} /> Validate List
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={4} cols={4} /></div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No validations yet"
          description="Upload a CSV to check which addresses have real, deliverable mailboxes before you email them."
          action={{ label: 'Validate a List', onClick: () => setShowImport(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {batches.map(batch => (
            <div
              key={batch.id}
              onClick={() => router.push(`/validation/${batch.id}`)}
              className="rounded-xl border bg-card p-5 card-hover cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{batch.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{batch.total.toLocaleString()} addresses</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setDeleteId(batch.id) }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="mt-3"><StatusPill batch={batch} /></div>

              {/* Bucket summary */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-green-600">{batch.counts.valid ?? 0} valid</span>
                <span className="text-amber-600">{batch.counts.risky ?? 0} risky</span>
                <span className="text-red-600">
                  {(batch.counts.invalid ?? 0) + (batch.counts.disposable ?? 0)} invalid
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDateTime(batch.created_at)}</span>
                <span className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Review <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ValidationImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onCreated={(id) => { qc.invalidateQueries({ queryKey: ['validation-batches'] }); router.push(`/validation/${id}`) }}
      />
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Validation Batch"
        description="This removes the staged list and its results. Leads you already pushed to your lead base are kept. Continue?"
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
