'use client'
import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { validationApi } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, FileText, X, ClipboardList, Loader2, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (batchId: number) => void
}

type Mode = 'file' | 'paste'

function parseCsv(text: string) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.')
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  if (!headers.includes('email')) throw new Error('CSV must have an "email" column.')
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
  }).filter(c => c.email)
}

export function ValidationImportDialog({ open, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('file')
  const [csvText, setCsvText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFile = (f: File) => {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      toast.error('Please upload a .csv file.')
      return
    }
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.[0]) readFile(e.dataTransfer.files[0])
  }, [])

  const mutation = useMutation({
    mutationFn: async () => {
      let contacts: any[]
      let name: string | undefined
      if (mode === 'file') {
        if (!file) throw new Error('Please select a CSV file.')
        contacts = parseCsv(await file.text())
        name = file.name.replace(/\.csv$/i, '')
      } else {
        if (!csvText.trim()) throw new Error('Please paste CSV data.')
        contacts = parseCsv(csvText)
      }
      if (contacts.length === 0) throw new Error('No rows with an email found in the CSV.')
      const res = await validationApi.createBatch({ name, contacts })
      return res.data
    },
    onSuccess: (data) => {
      toast.success(`Verifying ${data.total} leads…`)
      handleClose()
      onCreated(data.id)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || err.message || 'Import failed')
    },
  })

  const handleClose = () => {
    setCsvText(''); setFile(null); setMode('file')
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  const canImport = mode === 'file' ? !!file : !!csvText.trim()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} /> Validate a Lead List
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex rounded-lg border p-1 gap-1">
            {([
              { key: 'file', label: 'Upload File', icon: FileText },
              { key: 'paste', label: 'Paste CSV', icon: ClipboardList },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
                  ${mode === tab.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Required CSV format (first row = headers):</p>
            <code>email,first_name,last_name,phone,company</code>
            <p className="mt-2">Each address is checked for real mailbox existence. You review the results, then push the valid ones to your leads.</p>
          </div>

          {mode === 'file' && (
            <div>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => e.target.files?.[0] && readFile(e.target.files[0])} />
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
                  <FileText size={20} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="text-muted-foreground hover:text-destructive">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={onDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors
                    ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'}`}
                >
                  <Upload size={28} className="mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop your CSV file here</p>
                  <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                </div>
              )}
            </div>
          )}

          {mode === 'paste' && (
            <div>
              <Label>CSV Data *</Label>
              <Textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={"email,first_name,last_name\njohn@example.com,John,Doe"}
                className="mt-1 font-mono text-xs h-40"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={!canImport || mutation.isPending}>
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {mutation.isPending ? 'Starting…' : 'Validate'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
