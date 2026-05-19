'use client'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { contactsApi, listsApi } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function BulkImportDialog({ open, onClose, onImported }: Props) {
  const [csvText, setCsvText] = useState('')
  const [listId, setListId] = useState<number | ''>('')
  const [result, setResult] = useState<any>(null)

  const { data: listsData } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const lines = csvText.trim().split('\n')
      if (lines.length < 2) throw new Error('CSV must have header and data rows')

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const contacts = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
      }).filter(c => c.email)

      const payload: any = { contacts }
      if (listId) payload.list_id = listId

      const res = await contactsApi.bulkImport(payload)
      return res.data
    },
    onSuccess: (data) => {
      setResult(data)
      onImported()
      toast.success(`Import complete: ${data.created} created, ${data.updated} updated`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || err.message || 'Import failed')
    },
  })

  const handleClose = () => {
    setCsvText('')
    setResult(null)
    setListId('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} /> Import Contacts (CSV)
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Created', value: result.created, icon: CheckCircle, color: 'text-green-600' },
                { label: 'Updated', value: result.updated, icon: CheckCircle, color: 'text-blue-600' },
                { label: 'Failed', value: result.failed, icon: XCircle, color: 'text-red-600' },
              ].map(s => (
                <div key={s.label} className="rounded-lg border p-3 text-center">
                  <s.icon className={`mx-auto mb-1 ${s.color}`} size={20} />
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive mb-1">Errors:</p>
                {result.errors.map((e: any, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">Row {e.row}: {e.error}</p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium mb-1">CSV Format (first row = headers):</p>
              <code className="text-xs">email,first_name,last_name,phone,company</code>
            </div>

            <div>
              <Label>CSV Data *</Label>
              <Textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder="email,first_name,last_name&#10;john@example.com,John,Doe&#10;jane@example.com,Jane,Smith"
                className="mt-1 font-mono text-xs h-40"
              />
            </div>

            <div>
              <Label>Add to List (optional)</Label>
              <select
                value={listId}
                onChange={e => setListId(e.target.value ? Number(e.target.value) : '')}
                className="w-full mt-1 h-9 px-3 rounded-lg border border-input bg-background text-sm"
              >
                <option value="">No list</option>
                {listsData?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => mutation.mutate()}
                loading={mutation.isPending}
                disabled={!csvText.trim()}
              >
                <Upload size={14} /> Import
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
