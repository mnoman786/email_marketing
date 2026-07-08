'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { workflowsApi } from '@/lib/api'
import { WorkflowListItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { Plus, Trash2, Workflow as WorkflowIcon, GitBranch } from 'lucide-react'
import toast from 'react-hot-toast'

export default function WorkflowsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.getAll().then(r => r.data as WorkflowListItem[]),
  })

  const createMut = useMutation({
    mutationFn: () => workflowsApi.create({ name: newName || 'Untitled Workflow' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setShowNew(false)
      setNewName('')
      router.push(`/workflows/${res.data.id}`)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => workflowsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => workflowsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      toast.success('Workflow deleted')
      setDeleteId(null)
    },
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground">Build automations on a visual canvas — triggers, conditions, and actions</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={16} /> New Workflow
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton rows={4} cols={4} /></div>
        ) : !workflows || workflows.length === 0 ? (
          <EmptyState
            icon={WorkflowIcon}
            title="No workflows yet"
            description="Build a visual automation: trigger on an email open, click, reply, or list change, branch on conditions, and act — add to a list, start a sequence, or notify a webhook."
            action={{ label: 'New Workflow', onClick: () => setShowNew(true) }}
          />
        ) : (
          <div className="divide-y">
            {workflows.map(wf => (
              <div
                key={wf.id}
                className="flex items-center justify-between gap-4 p-4 table-row-hover cursor-pointer"
                onClick={() => router.push(`/workflows/${wf.id}`)}
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                    <GitBranch size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{wf.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {wf.node_count} node{wf.node_count === 1 ? '' : 's'} · {wf.run_count} run{wf.run_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                  <Switch checked={wf.is_active} onCheckedChange={() => toggleMut.mutate(wf.id)} />
                  <Button
                    variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(wf.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. Tag interested leads"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Delete Workflow"
        description="This workflow and its run history will be permanently deleted."
        confirmLabel="Delete"
        destructive
        loading={deleteMut.isPending}
      />
    </div>
  )
}
