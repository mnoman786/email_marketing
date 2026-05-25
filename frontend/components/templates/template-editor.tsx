'use client'
import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import * as Popover from '@radix-ui/react-popover'
import { templatesApi } from '@/lib/api'
import { EmailTemplate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Plus, X, Loader2, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type { GrapesEditorHandle } from './grapes-editor'
import { ImportTemplateDialog } from './import-template-dialog'

const GrapesEmailEditor = dynamic(
  () => import('./grapes-editor').then(m => m.GrapesEmailEditor),
  { ssr: false, loading: () => <EditorSkeleton /> }
)

function EditorSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 size={28} className="animate-spin" />
        <p className="text-sm">Loading editor…</p>
      </div>
    </div>
  )
}

// ─── Project persistence ──────────────────────────────────────────────────────

const MARKER = 'grapesjs-project-v1'
const RE = new RegExp(`<!--${MARKER}:([A-Za-z0-9+/=%-]+):${MARKER}-->`)

function extractProject(html: string): object | null {
  const m = html.match(RE)
  if (!m) return null
  try { return JSON.parse(decodeURIComponent(atob(m[1]))) } catch { return null }
}

function embedProject(html: string, data: object): string {
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)))
  return `${html.replace(RE, '').trimEnd()}\n<!--${MARKER}:${encoded}:${MARKER}-->`
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  subject: z.string().min(1, 'Subject required'),
  preview_text: z.string().optional(),
  is_active: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

// ─── Settings popover (variables + plain text) ────────────────────────────────

function SettingsPopover({
  variables, onVariablesChange,
  textContent, onTextContentChange,
}: {
  variables: string[]
  onVariablesChange: (v: string[]) => void
  textContent: string
  onTextContentChange: (v: string) => void
}) {
  const [newVar, setNewVar] = useState('')

  const add = () => {
    const v = newVar.trim().replace(/\s+/g, '_').toLowerCase()
    if (v && !variables.includes(v)) {
      onVariablesChange([...variables, v])
      setNewVar('')
    }
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 size={14} />
          Settings
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-xl border bg-card shadow-xl p-0 outline-none"
        >
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Template Settings</p>
          </div>

          <div className="p-4 space-y-5">
            {/* Variables */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Merge Variables
              </Label>
              <p className="text-xs text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">&#123;&#123;variable&#125;&#125;</code> inside your blocks
              </p>
              <div className="flex gap-2">
                <Input
                  value={newVar}
                  onChange={e => setNewVar(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && add()}
                  placeholder="variable_name"
                  className="h-8 text-xs"
                />
                <Button size="icon-sm" variant="outline" onClick={add}>
                  <Plus size={12} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {variables.map(v => (
                  <span key={v} className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-mono">
                    &#123;&#123;{v}&#125;&#125;
                    <button
                      onClick={() => onVariablesChange(variables.filter(x => x !== v))}
                      className="hover:text-destructive ml-0.5"
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Plain text */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plain Text Fallback
              </Label>
              <Textarea
                value={textContent}
                onChange={e => onTextContentChange(e.target.value)}
                placeholder="Plain text version for email clients that don't render HTML…"
                className="text-xs h-28 resize-none"
              />
            </div>
          </div>

          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props { template?: EmailTemplate }

export function TemplateEditor({ template }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const editorRef = useRef<GrapesEditorHandle>(null)
  const [textContent, setTextContent] = useState(template?.text_content || '')
  const [variables, setVariables] = useState<string[]>(
    template?.variables || ['first_name', 'last_name', 'full_name', 'email']
  )

  const savedProject = template?.html_content ? extractProject(template.html_content) : null

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: template?.name || '',
      subject: template?.subject || '',
      preview_text: template?.preview_text || '',
      is_active: template?.is_active ?? true,
    },
  })
  const isActive = watch('is_active')

  const mutation = useMutation({
    mutationFn: (formData: FormData) => {
      const html = editorRef.current?.exportHtml() ?? ''
      const project = editorRef.current?.getProjectData() ?? {}
      const payload = {
        ...formData,
        html_content: embedProject(html, project),
        text_content: textContent,
        variables,
      }
      return template
        ? templatesApi.update(template.id, payload)
        : templatesApi.create(payload)
    },
    onSuccess: () => {
      toast.success(template ? 'Template saved' : 'Template created')
      qc.invalidateQueries({ queryKey: ['templates'] })
      router.push('/templates')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.name?.[0] || 'Failed to save template')
    },
  })

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Compact header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card shrink-0">

        {/* Back */}
        <Button variant="ghost" size="icon-sm" onClick={() => router.push('/templates')}>
          <ArrowLeft size={16} />
        </Button>

        <div className="w-px h-5 bg-border" />

        {/* Name */}
        <div className="flex flex-col min-w-0">
          <Input
            {...register('name')}
            placeholder="Template name…"
            className="h-8 text-sm font-medium border-0 shadow-none px-0 focus-visible:ring-0 w-44"
          />
          {errors.name && (
            <p className="text-xs text-destructive leading-none mt-0.5">{errors.name.message}</p>
          )}
        </div>

        {/* Subject */}
        <div className="flex flex-col flex-1 min-w-0 max-w-xs">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground shrink-0">Subject:</span>
            <Input
              {...register('subject')}
              placeholder="Email subject…"
              className="h-8 text-sm border-0 shadow-none px-1 focus-visible:ring-0"
            />
          </div>
          {errors.subject && (
            <p className="text-xs text-destructive leading-none mt-0.5">{errors.subject.message}</p>
          )}
        </div>

        {/* Preview text */}
        <div className="flex items-center gap-1 max-w-48 hidden xl:flex">
          <span className="text-xs text-muted-foreground shrink-0">Preview:</span>
          <Input
            {...register('preview_text')}
            placeholder="Inbox preview…"
            className="h-8 text-sm border-0 shadow-none px-1 focus-visible:ring-0"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Active toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Active</span>
          <Switch
            checked={isActive}
            onCheckedChange={v => setValue('is_active', v)}
            className="scale-90"
          />
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Select template */}
        <ImportTemplateDialog
          onImport={html => editorRef.current?.loadHtml(html)}
        />

        {/* Settings popover */}
        <SettingsPopover
          variables={variables}
          onVariablesChange={setVariables}
          textContent={textContent}
          onTextContentChange={setTextContent}
        />

        {/* Save */}
        <Button size="sm" onClick={handleSubmit(d => mutation.mutate(d))} disabled={mutation.isPending}>
          {mutation.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
            : <><Save size={14} /> Save</>}
        </Button>
      </div>

      {/* ── GrapesJS full width ── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <GrapesEmailEditor
          ref={editorRef}
          projectData={savedProject}
          initialHtml={!savedProject && template?.html_content ? template.html_content : null}
          minHeight="calc(100vh - 112px)"
        />
      </div>
    </div>
  )
}
