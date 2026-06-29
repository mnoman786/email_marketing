'use client'
import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { inboxApi, contactsApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor, RichTextEditorHandle } from './rich-text-editor'
import { Paperclip, X, Send, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  smtpAccounts: SMTPAccount[]
  onSent: () => void
}

export function ComposeModal({ open, onOpenChange, smtpAccounts, onSent }: Props) {
  const [contactQuery, setContactQuery] = useState('')
  const [contactId, setContactId] = useState<number | null>(null)
  const [contactLabel, setContactLabel] = useState('')
  const [smtpAccountId, setSmtpAccountId] = useState<number | null>(smtpAccounts[0]?.id ?? null)
  const [subject, setSubject] = useState('')
  const [includeSignature, setIncludeSignature] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const [bodyHtml, setBodyHtml] = useState('')
  const editorRef = useRef<RichTextEditorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: contactResults } = useQuery({
    queryKey: ['compose-contact-search', contactQuery],
    queryFn: () => contactsApi.getAll({ search: contactQuery, page_size: 10 }).then(r => r.data.items || []),
    enabled: contactQuery.length > 1 && !contactId,
  })

  const selectedAccount = smtpAccounts.find(a => a.id === smtpAccountId)
  const queryIsEmail = EMAIL_RE.test(contactQuery.trim())

  const createContactMut = useMutation({
    mutationFn: () => contactsApi.create({ email: contactQuery.trim() }),
    onSuccess: (res) => {
      setContactId(res.data.id)
      setContactLabel(res.data.email)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to create contact'),
  })

  const reset = () => {
    setContactQuery(''); setContactId(null); setContactLabel(''); setSubject('')
    setFiles([]); setBodyHtml(''); editorRef.current?.clear()
  }

  const sendMut = useMutation({
    mutationFn: () => inboxApi.compose({
      contact_id: contactId as number,
      smtp_account_id: smtpAccountId as number,
      subject,
      html_content: bodyHtml,
      include_signature: includeSignature,
      files,
    }),
    onSuccess: () => {
      toast.success('Email sent')
      reset()
      onOpenChange(false)
      onSent()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send email'),
  })

  const canSend = contactId && smtpAccountId && subject.trim() && bodyHtml.trim()

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New email</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            {contactId ? (
              <div className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                <span>{contactLabel}</span>
                <button onClick={() => { setContactId(null); setContactLabel(''); setContactQuery('') }} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Search contacts by name or email…"
                  value={contactQuery}
                  onChange={e => setContactQuery(e.target.value)}
                  className="text-sm"
                />
                {contactQuery.length > 1 && (
                  <div className="absolute z-10 mt-1 w-full border rounded-lg bg-card shadow-md max-h-48 overflow-y-auto">
                    {(contactResults || []).map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setContactId(c.id)
                          setContactLabel(`${c.full_name || c.email} <${c.email}>`)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
                      >
                        {c.first_name || c.last_name ? `${c.first_name} ${c.last_name}`.trim() : c.email}
                        <span className="text-muted-foreground ml-1">{c.email}</span>
                      </button>
                    ))}
                    {contactResults && contactResults.length === 0 && (
                      queryIsEmail ? (
                        <button
                          onClick={() => createContactMut.mutate()}
                          disabled={createContactMut.isPending}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex items-center gap-2 text-primary"
                        >
                          <UserPlus size={14} /> Add new contact &ldquo;{contactQuery.trim()}&rdquo;
                        </button>
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No matching contacts. Type a full email address to add a new one.
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Select value={smtpAccountId ? String(smtpAccountId) : undefined} onValueChange={v => setSmtpAccountId(Number(v))}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Send from…" />
            </SelectTrigger>
            <SelectContent>
              {smtpAccounts.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.from_email})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} className="text-sm" />

          <RichTextEditor
            ref={editorRef}
            placeholder="Write your message…"
            onChange={html => setBodyHtml(html)}
          />

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-1 rounded-full">
                  {f.name}
                  <button onClick={() => setFiles(fs => fs.filter((_, idx) => idx !== i))}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Paperclip size={13} /> Attach files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => setFiles(fs => [...fs, ...Array.from(e.target.files || [])])}
              />
              {selectedAccount?.signature_html && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={includeSignature} onChange={e => setIncludeSignature(e.target.checked)} />
                  Include signature
                </label>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSend} loading={sendMut.isPending} onClick={() => sendMut.mutate()}>
            <Send size={14} /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
