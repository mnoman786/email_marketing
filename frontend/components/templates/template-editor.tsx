'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api'
import { EmailTemplate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, Eye, Code, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  subject: z.string().min(1, 'Subject required'),
  preview_text: z.string().optional(),
  is_active: z.boolean().optional(),
})

type FormData = z.infer<typeof schema>

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #3b82f6; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .footer { background: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Hello, {{ first_name }}!</h1>
    </div>
    <div class="content">
      <h2>Your email content here</h2>
      <p>Hi {{ full_name }}, thank you for subscribing!</p>
      <p>We're excited to have you on board.</p>
      <a href="#" class="btn">Click Here</a>
    </div>
    <div class="footer">
      <p>© 2026 {{ company }}. All rights reserved.</p>
      <p><a href="#">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`

interface Props {
  template?: EmailTemplate
}

export function TemplateEditor({ template }: Props) {
  const router = useRouter()
  const [html, setHtml] = useState(template?.html_content || DEFAULT_HTML)
  const [textContent, setTextContent] = useState(template?.text_content || '')
  const [variables, setVariables] = useState<string[]>(template?.variables || ['first_name', 'last_name', 'full_name', 'email'])
  const [newVar, setNewVar] = useState('')
  const [tab, setTab] = useState<'html' | 'preview' | 'text'>('html')
  const [previewHtml, setPreviewHtml] = useState('')
  const [useTheme, setUseTheme] = useState(false)

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
    mutationFn: (data: FormData) => {
      const payload = { ...data, html_content: html, text_content: textContent, variables }
      return template
        ? templatesApi.update(template.id, payload)
        : templatesApi.create(payload)
    },
    onSuccess: () => {
      toast.success(template ? 'Template saved' : 'Template created')
      router.push('/templates')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.name?.[0] || 'Failed to save template')
    },
  })

  const generatePreview = () => {
    setPreviewHtml(html
      .replace(/\{\{\s*first_name\s*\}\}/g, 'John')
      .replace(/\{\{\s*last_name\s*\}\}/g, 'Doe')
      .replace(/\{\{\s*full_name\s*\}\}/g, 'John Doe')
      .replace(/\{\{\s*email\s*\}\}/g, 'john@example.com')
      .replace(/\{\{\s*company\s*\}\}/g, 'Acme Inc.')
    )
    setTab('preview')
  }

  const addVariable = () => {
    const v = newVar.trim().replace(/\s+/g, '_').toLowerCase()
    if (v && !variables.includes(v)) {
      setVariables([...variables, v])
      setNewVar('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/templates')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="font-semibold">{template ? 'Edit Template' : 'New Template'}</h1>
            <p className="text-xs text-muted-foreground">HTML email template editor</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generatePreview}>
            <Eye size={15} /> Preview
          </Button>
          <Button onClick={handleSubmit(d => mutation.mutate(d))} loading={mutation.isPending}>
            <Save size={15} /> Save Template
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Settings */}
        <div className="w-72 border-r overflow-y-auto p-4 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Template Info</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Template Name *</Label>
                <Input {...register('name')} placeholder="Welcome Email" className="mt-1 h-8 text-sm" />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Email Subject *</Label>
                <Input {...register('subject')} placeholder="Welcome to {{company}}!" className="mt-1 h-8 text-sm" />
                {errors.subject && <p className="text-xs text-destructive mt-1">{errors.subject.message}</p>}
              </div>
              <div>
                <Label className="text-xs">Preview Text</Label>
                <Input {...register('preview_text')} placeholder="Short email preview..." className="mt-1 h-8 text-sm" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={isActive}
                  onCheckedChange={v => setValue('is_active', v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Variables</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Use &#123;&#123;variable&#125;&#125; in your template</p>
              <div className="flex gap-2">
                <Input
                  value={newVar}
                  onChange={e => setNewVar(e.target.value)}
                  placeholder="variable_name"
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => e.key === 'Enter' && addVariable()}
                />
                <Button size="icon-sm" variant="outline" onClick={addVariable}>
                  <Plus size={12} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {variables.map(v => (
                  <span key={v} className="flex items-center gap-1 badge bg-muted text-muted-foreground text-xs">
                    &#123;&#123;{v}&#125;&#125;
                    <button
                      onClick={() => setVariables(variables.filter(x => x !== v))}
                      className="hover:text-destructive"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Plain Text</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Plain text version of your email..."
                className="text-xs h-28"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Editor / Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b bg-card px-4">
            {[
              { key: 'html', label: 'HTML Editor', icon: Code },
              { key: 'preview', label: 'Preview', icon: Eye },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => key === 'preview' ? generatePreview() : setTab(key as any)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {tab === 'html' ? (
            <div className="flex-1 overflow-hidden">
              <MonacoEditor
                height="100%"
                language="html"
                value={html}
                onChange={v => setHtml(v || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  folding: true,
                  formatOnPaste: true,
                }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
              <div className="max-w-2xl mx-auto my-6 bg-white shadow-lg rounded-lg overflow-hidden">
                <iframe
                  srcDoc={previewHtml || html}
                  className="w-full"
                  style={{ height: '600px', border: 'none' }}
                  title="Email Preview"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
