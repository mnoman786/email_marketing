'use client'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import {
  BUILT_IN_TEMPLATES, CATEGORIES,
  BuiltInTemplate, TemplateCategory,
} from './template-library'

interface Props {
  onImport: (html: string) => void
}

function TemplatePreview({ html, accentColor }: { html: string; accentColor: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-t-lg bg-white" style={{ height: 200 }}>
      <iframe
        srcDoc={html}
        title="preview"
        scrolling="no"
        style={{
          border: 'none',
          width: '600px',
          height: '800px',
          transform: 'scale(0.333)',
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
      {/* fade-out bottom */}
      <div
        className="absolute inset-x-0 bottom-0 h-12"
        style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.95))' }}
      />
    </div>
  )
}

function CategoryPill({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0
        ${active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
    >
      {label}
    </button>
  )
}

export function ImportTemplateDialog({ onImport }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<TemplateCategory>('all')
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = category === 'all'
    ? BUILT_IN_TEMPLATES
    : BUILT_IN_TEMPLATES.filter(t => t.category === category)

  const handleImport = (t: BuiltInTemplate) => {
    onImport(t.html)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download size={14} />
          Select Template
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl w-full p-0 gap-0 flex flex-col" style={{ maxHeight: '85vh', height: '85vh' }}>
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Select a Template</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick a pre-built design to start from — you can customise everything after.
          </p>
        </DialogHeader>

        {/* Category filters */}
        <div className="flex gap-2 px-6 py-3 border-b bg-muted/30 overflow-x-auto shrink-0">
          {CATEGORIES.map(c => (
            <CategoryPill
              key={c.value}
              label={c.label}
              active={category === c.value}
              onClick={() => setCategory(c.value)}
            />
          ))}
        </div>

        {/* Template grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {filtered.map(t => (
              <div
                key={t.id}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="group relative rounded-xl border bg-card overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/40"
                onClick={() => handleImport(t)}
              >
                <TemplatePreview html={t.html} accentColor={t.accentColor} />

                {/* Hover overlay */}
                <div className={`absolute inset-0 bg-primary/5 flex items-center justify-center transition-opacity duration-200 ${hoveredId === t.id ? 'opacity-100' : 'opacity-0'}`}>
                  <Button size="sm" className="shadow-lg">
                    Use This Template
                  </Button>
                </div>

                {/* Info bar */}
                <div className="px-3 py-2.5 border-t bg-card">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full capitalize shrink-0 ml-2"
                      style={{
                        background: `${t.accentColor}18`,
                        color: t.accentColor,
                      }}
                    >
                      {t.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <p className="text-sm">No templates in this category yet.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
