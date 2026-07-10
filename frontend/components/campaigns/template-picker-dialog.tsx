'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api'
import { EmailTemplate, PaginatedResponse } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/ui/search-input'
import { Sparkles, Mail } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (subject: string, html: string, text: string) => void
}

/** Browse the built-in template library (plus any of the user's own saved
 * templates) and prefill a step/variant's subject+body from one — used from
 * campaign-form.tsx's Subject field, which works identically for a plain
 * step or an active A/B variant tab. */
export function TemplatePickerDialog({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [pickingId, setPickingId] = useState<number | null>(null)

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

  const pickMut = useMutation({
    mutationFn: (id: number) => templatesApi.get(id).then(r => r.data as EmailTemplate),
    onSuccess: (tpl) => {
      onSelect(tpl.subject, tpl.html_content, tpl.text_content)
      handleClose()
    },
    onSettled: () => setPickingId(null),
  })

  const handleClose = () => {
    setSearch('')
    onClose()
  }

  const templates = data?.items || []
  // Built-ins first, then the user's own — within each group the API's
  // default -updated_at ordering already surfaces recently-touched ones.
  const sorted = [...templates].sort((a, b) => (b.is_system ? 1 : 0) - (a.is_system ? 1 : 0))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles size={16} /> Browse Templates
          </DialogTitle>
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            wrapperClassName="mt-2"
          />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No templates found.</p>
          ) : (
            sorted.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                disabled={pickMut.isPending}
                onClick={() => { setPickingId(tpl.id); pickMut.mutate(tpl.id) }}
                className="w-full text-left flex items-start gap-3 p-3 rounded-lg border hover:border-primary/40 hover:bg-muted/40 transition-colors disabled:opacity-60"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {pickingId === tpl.id ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  ) : (
                    <Mail size={14} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tpl.name}</p>
                    {tpl.is_system && <Badge variant="secondary" className="text-[10px] shrink-0">Built-in</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.subject}</p>
                  {tpl.preview_text && (
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{tpl.preview_text}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
