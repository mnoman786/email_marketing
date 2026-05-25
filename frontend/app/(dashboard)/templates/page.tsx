'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { templatesApi } from '@/lib/api'
import { EmailTemplate, PaginatedResponse } from '@/lib/types'
import { BUILT_IN_TEMPLATES, CATEGORIES, BuiltInTemplate, TemplateCategory } from '@/components/templates/template-library'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatDateTime } from '@/lib/utils'
import { Plus, Search, Trash2, Mail, Copy, Edit, Eye, Loader2, BookOpen, X, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function TemplatesPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [libCategory, setLibCategory] = useState<TemplateCategory>('all')
  const [libSearch, setLibSearch] = useState('')
  const [usingId, setUsingId] = useState<string | null>(null)
  const [previewTpl, setPreviewTpl] = useState<BuiltInTemplate | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['templates', { search }],
    queryFn: () => templatesApi.getAll({ search }).then(r => r.data as PaginatedResponse<EmailTemplate>),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => templatesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template deleted')
      setDeleteId(null)
    },
  })

  const dupMut = useMutation({
    mutationFn: (id: number) => templatesApi.duplicate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template duplicated')
    },
  })

  const addLibMut = useMutation({
    mutationFn: async (tpl: BuiltInTemplate) => {
      const res = await templatesApi.create({
        name: tpl.name,
        subject: tpl.name,
        html_content: tpl.html,
        text_content: '',
        preview_text: tpl.description,
        variables: ['first_name', 'last_name', 'full_name', 'email'],
        is_active: true,
      })
      return res.data as EmailTemplate
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template added to My Templates')
      setUsingId(null)
      router.push(`/templates/${created.id}`)
    },
    onError: () => {
      toast.error('Failed to use template')
      setUsingId(null)
    },
  })

  const templates = data?.items || []

  const filteredLib = BUILT_IN_TEMPLATES.filter(t => {
    const matchCat = libCategory === 'all' || t.category === libCategory
    const matchQ = !libSearch || t.name.toLowerCase().includes(libSearch.toLowerCase()) || t.description.toLowerCase().includes(libSearch.toLowerCase())
    return matchCat && matchQ
  })

  return (
    <div className="p-6 space-y-10">

      {/* ── My Templates ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <p className="text-sm text-muted-foreground">Your saved templates</p>
          </div>
          <Link href="/templates/new">
            <Button><Plus size={16} /> New Template</Button>
          </Link>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <Input
            placeholder="Search my templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No templates yet"
            description="Create a new template or use one from the library below."
            action={{ label: 'Create Template', onClick: () => router.push('/templates/new') }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {templates.map(tpl => (
              <MyTemplateCard
                key={tpl.id}
                tpl={tpl}
                onDuplicate={() => dupMut.mutate(tpl.id)}
                onDelete={() => setDeleteId(tpl.id)}
                duplicating={dupMut.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Divider ── */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t" />
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <BookOpen size={15} />
          Template Library
        </div>
        <div className="flex-1 border-t" />
      </div>

      {/* ── Template Library ── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold">{BUILT_IN_TEMPLATES.length} Ready-to-Use Templates</h2>
            <p className="text-sm text-muted-foreground">Click &quot;Use Template&quot; to add it to your templates and open the editor</p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              placeholder="Search library..."
              value={libSearch}
              onChange={e => setLibSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setLibCategory(cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                libCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat.label}
              {cat.value !== 'all' && (
                <span className="ml-1.5 opacity-60">
                  {BUILT_IN_TEMPLATES.filter(t => t.category === cat.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {filteredLib.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No templates match your search.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredLib.map(tpl => (
              <LibraryCard
                key={tpl.id}
                tpl={tpl}
                loading={usingId === tpl.id && addLibMut.isPending}
                onPreview={() => setPreviewTpl(tpl)}
                onUse={() => {
                  setUsingId(tpl.id)
                  addLibMut.mutate(tpl)
                }}
              />
            ))}
          </div>
        )}
      </section>

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

      {previewTpl && (
        <LibraryPreviewModal
          tpl={previewTpl}
          loading={usingId === previewTpl.id && addLibMut.isPending}
          onClose={() => setPreviewTpl(null)}
          onUse={() => {
            setUsingId(previewTpl.id)
            addLibMut.mutate(previewTpl)
          }}
        />
      )}
    </div>
  )
}

// ─── My Template Card ─────────────────────────────────────────────────────────

function MyTemplateCard({
  tpl, onDuplicate, onDelete, duplicating,
}: {
  tpl: EmailTemplate
  onDuplicate: () => void
  onDelete: () => void
  duplicating: boolean
}) {
  const hasPreview = !!(tpl.preview_html || tpl.html_content)

  return (
    <div className="group rounded-2xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col">

      {/* Preview */}
      <div className="relative overflow-hidden bg-gray-50" style={{ height: 160 }}>
        {hasPreview ? (
          <iframe
            srcDoc={tpl.preview_html || tpl.html_content}
            title={tpl.name}
            scrolling="no"
            style={{
              position: 'absolute',
              top: -18,
              left: -8,
              border: 'none',
              width: '600px',
              height: '300px',
              transform: 'scale(0.62)',
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 gap-2">
            <Mail className="text-slate-300 dark:text-slate-600" size={36} />
            <span className="text-xs text-slate-400 dark:text-slate-600">No preview</span>
          </div>
        )}
        {/* Fade covers the bottom half to hide email body text */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent 30%, hsl(var(--card)) 72%)' }} />

        {/* Status badge */}
        <div className="absolute top-2 right-2">
          <Badge variant={tpl.is_active ? 'success' : 'secondary'} className="text-[10px] px-2 py-0.5 shadow-sm">
            {tpl.is_active ? 'Active' : 'Draft'}
          </Badge>
        </div>

        {/* Hover overlay */}
        <Link href={`/templates/${tpl.id}`}>
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-all duration-200 cursor-pointer">
            <span className="flex items-center gap-1.5 bg-white text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
              <Eye size={12} /> Open Editor
            </span>
          </div>
        </Link>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1 space-y-1.5">
          <h3 className="font-semibold text-sm leading-tight truncate" title={tpl.name}>{tpl.name}</h3>

          {/* Show subject only if different from name */}
          {tpl.subject && tpl.subject !== tpl.name && (
            <p className="text-xs text-muted-foreground truncate" title={tpl.subject}>
              {tpl.subject}
            </p>
          )}

          {/* Preview text as description */}
          {tpl.preview_text && (
            <p className="text-xs text-muted-foreground/70 truncate" title={tpl.preview_text}>
              {tpl.preview_text}
            </p>
          )}

          {tpl.variables && tpl.variables.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tpl.variables.slice(0, 4).map(v => (
                <span key={v} className="bg-primary/8 text-primary/70 rounded-md px-1.5 py-0.5 text-[10px] font-mono leading-none">
                  {`{{${v}}}`}
                </span>
              ))}
              {tpl.variables.length > 4 && (
                <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[10px] leading-none">
                  +{tpl.variables.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-[10px] text-muted-foreground tabular-nums">{formatDateTime(tpl.updated_at)}</span>
          <div className="flex items-center gap-0.5">
            <Link href={`/templates/${tpl.id}`}>
              <Button variant="ghost" size="icon-sm" title="Edit" className="text-muted-foreground hover:text-foreground">
                <Edit size={13} />
              </Button>
            </Link>
            <Button variant="ghost" size="icon-sm" onClick={onDuplicate} loading={duplicating} title="Duplicate" className="text-muted-foreground hover:text-foreground">
              <Copy size={13} />
            </Button>
            <Button
              variant="ghost" size="icon-sm"
              className="text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete} title="Delete"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Library Card ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  welcome: 'Welcome', newsletter: 'Newsletter', promotional: 'Promo',
  product: 'Product', ecommerce: 'E-commerce', reengagement: 'Re-engage',
  event: 'Events', seasonal: 'Seasonal', saas: 'SaaS', b2b: 'B2B',
}

function LibraryCard({ tpl, onUse, onPreview, loading }: {
  tpl: BuiltInTemplate
  onUse: () => void
  onPreview: () => void
  loading: boolean
}) {
  return (
    <div className="group rounded-2xl border bg-card shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col">

      {/* Accent header — click to preview */}
      <button
        onClick={onPreview}
        className="relative flex flex-col items-center justify-center text-center px-5 py-8 overflow-hidden w-full text-left cursor-pointer"
        style={{ background: `linear-gradient(135deg, ${tpl.accentColor}ee, ${tpl.accentColor}aa)`, minHeight: 140 }}
      >
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20" style={{ background: 'rgba(255,255,255,0.4)' }} />
        <div className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full opacity-10" style={{ background: 'rgba(255,255,255,0.5)' }} />

        <Mail size={28} color="rgba(255,255,255,0.7)" style={{ marginBottom: 10 }} />
        <h3 className="font-bold text-sm leading-snug text-white relative z-10" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
          {tpl.name}
        </h3>

        <span className="absolute top-2.5 right-2.5 bg-black/20 text-white/90 text-[9px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          {CATEGORY_LABELS[tpl.category] || tpl.category}
        </span>

        {/* Preview hint on hover */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-all duration-200">
          <span className="flex items-center gap-1.5 bg-white text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg shadow opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
            <Eye size={12} /> Preview
          </span>
        </span>
      </button>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1 leading-relaxed">{tpl.description}</p>

        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs flex-none"
            onClick={onPreview}
          >
            <Eye size={12} /> Preview
          </Button>
          <Button
            className="flex-1 h-8 text-xs font-semibold text-white border-0 hover:opacity-90 transition-opacity"
            size="sm"
            onClick={onUse}
            disabled={loading}
            style={{ background: tpl.accentColor }}
          >
            {loading ? <><Loader2 size={12} className="animate-spin" /> Adding…</> : 'Use Template'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Library Preview Modal ────────────────────────────────────────────────────

function LibraryPreviewModal({ tpl, onClose, onUse, loading }: {
  tpl: BuiltInTemplate
  onClose: () => void
  onUse: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(820px, 95vw)', height: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: tpl.accentColor }}
            >
              <Mail size={14} color="white" />
            </div>
            <div>
              <p className="font-semibold text-sm">{tpl.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{CATEGORY_LABELS[tpl.category] || tpl.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-8 text-xs font-semibold text-white border-0 hover:opacity-90"
              size="sm"
              onClick={onUse}
              disabled={loading}
              style={{ background: tpl.accentColor }}
            >
              {loading ? <><Loader2 size={12} className="animate-spin" /> Adding…</> : 'Use This Template'}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Full preview */}
        <div className="flex-1 min-h-0 bg-gray-100 overflow-auto">
          <iframe
            srcDoc={tpl.html}
            title={tpl.name}
            className="w-full h-full border-none"
            style={{ minHeight: '100%' }}
          />
        </div>

        {/* Footer note */}
        <div className="px-5 py-2.5 border-t bg-muted/30 shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tpl.description}</p>
          <p className="text-xs text-muted-foreground">
            Variables like <code className="bg-muted px-1 rounded">{'{{first_name}}'}</code> are filled automatically
          </p>
        </div>
      </div>
    </div>
  )
}
