'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, FileSpreadsheet, Info, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = /\.(csv|xlsx|xls)$/i

interface Props {
  open: boolean
  onClose: () => void
  listId?: number
}

export function LeadImportDialog({ open, onClose, listId }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const { data } = await contactsApi.importStatus(taskId)
        if (cancelled) return
        if (data.state === 'pending') return
        setProgress(`${data.current} of ${data.total} checked · ${data.created} added · ${data.updated} updated`)
        if (data.state === 'success') {
          window.clearInterval(timer)
          queryClient.invalidateQueries({ queryKey: ['contacts'] })
          toast.success(`Import complete: ${data.created} added, ${data.updated} updated, ${data.blocked} rejected, ${data.failed} failed`)
          setTaskId(null)
        }
      } catch {
        // A temporary status request failure should not stop the running import.
      }
    }, 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [taskId, queryClient])

  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return
    if (!ALLOWED_EXTENSIONS.test(candidate.name)) {
      toast.error('Choose a CSV or Excel file (.csv, .xlsx, .xls).')
      setFile(null)
    } else if (!candidate.size || candidate.size > MAX_FILE_BYTES) {
      toast.error('The file must be no more than 25 MB.')
      setFile(null)
    } else {
      setFile(candidate)
      setProgress('')
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const startImport = async () => {
    if (!file) return
    setUploading(true)
    try {
      const { data } = await contactsApi.importFile(file, listId)
      setTaskId(data.task_id)
      setProgress(`Checking ${data.total} leads…`)
      setFile(null)
      toast.success(`Import started for ${data.total} leads`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Could not import this file')
    } finally {
      setUploading(false)
    }
  }

  const close = () => {
    if (uploading) return
    setFile(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogHeader>
          <div className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Upload size={19} />
            </div>
            <DialogTitle>Import leads</DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">Bring your contacts into MailFlow from a spreadsheet.</p>
          </div>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={event => chooseFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]) }}
            disabled={uploading || !!taskId}
            className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors disabled:opacity-50 ${dragging ? 'border-primary bg-primary/10' : 'border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10'}`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background text-primary shadow-sm"><FileSpreadsheet size={24} /></span>
            <span className="text-sm font-semibold">Drop your file here, or browse</span>
            <span className="text-xs text-muted-foreground">CSV, XLSX or XLS · Up to 25 MB</span>
          </button>
          {file && (
            <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-3">
              <FileSpreadsheet size={20} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to import</p>
              </div>
              <button type="button" aria-label="Remove file" onClick={() => setFile(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
            </div>
          )}
          <div className="flex gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info size={17} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Prepare your file</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">The first row needs an <span className="font-semibold text-foreground">email</span> column. Optional columns include first_name, last_name, phone, company and any other details.</p>
            </div>
          </div>
          {progress && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 size={16} className="text-primary" />{progress}</p>}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={close}>Close</Button>
          <Button onClick={startImport} disabled={!file || !!taskId} loading={uploading}><Upload size={15} /> Import leads</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
