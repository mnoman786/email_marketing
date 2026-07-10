'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api'
import { EmailTemplate, PaginatedResponse } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { Sparkles, Mail, Eye } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (subject: string, html: string, text: string) => void
}

/** Browse the built-in template library (plus any of the user's own saved
 * templates), preview one, then confirm to prefill a step/variant's
 * subject+body — used from campaign-form.tsx's Subject field, which works
 * identically for a plain step or an active A/B variant tab. */
export function TemplatePickerDialog({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['templates-picker', debounced],
    queryFn: () => templatesApi.getAll({ search: debounced || undefined, is_active: true, page_size: 100 })
      .then(r => r.data as PaginatedResponse<EmailTemplate>),
    enabled: open,
  })

  // Full detail (list response truncates html_content and omits text_content).
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['template-picker-detail', selectedId],
    queryFn: () => templatesApi.get(selectedId as number).then(r => r.data as EmailTemplate),
    enabled: selectedId !== null,
  })

  const handleClose = () => {
    setSearch('')
    setSelectedId(null)
    onClose()
  }

  const handleUse = () => {
    if (!detail) return
    onSelect(detail.subject, detail.html_content, detail.text_content)
    handleClose()
  }

  const templates = data?.items || []
  // Built-ins first, then the user's own — within each group the API's
  // default -updated_at ordering already surfaces recently-touched ones.
  const sorted = [...templates].sort((a, b) => (b.is_system ? 1 : 0) - (a.is_system ? 1 : 0))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles size={16} /> Browse Templates
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[17rem_1fr]">
          {/* List */}
          <div className="border-r flex flex-col min-h-0">
            <div className="p-2.5 border-b">
              <SearchInput
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search templates..."
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No templates found.</p>
              ) : (
                sorted.map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedId(tpl.id)}
                    className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                      selectedId === tpl.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/60'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Mail size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium truncate">{tpl.name}</p>
                      </div>
                      {tpl.is_system && <Badge variant="secondary" className="text-[9px] mt-1">Built-in</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col min-h-0">
            {selectedId === null ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Eye size={22} />
                <p className="text-sm">Select a template to preview</p>
              </div>
            ) : detailLoading || !detail ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading preview…</div>
            ) : (
              <>
                <div className="px-5 py-3 border-b shrink-0">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium">{detail.subject}</p>
                </div>
                <div className="flex-1 overflow-auto bg-gray-100 min-h-0">
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;line-height:1.6;padding:20px;margin:0;">${detail.html_content}</body></html>`}
                    className="w-full h-full border-none"
                    title="Template preview"
                  />
                </div>
                <div className="px-5 py-3 border-t shrink-0 flex justify-end">
                  <Button onClick={handleUse}>
                    <Sparkles size={14} /> Use This Template
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
