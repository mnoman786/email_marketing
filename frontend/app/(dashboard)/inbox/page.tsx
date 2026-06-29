'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, addHours, set } from 'date-fns'
import { inboxApi, smtpApi, API_URL } from '@/lib/api'
import { ThreadListItem, ThreadDetail, PaginatedResponse, SMTPAccount, ReplyTemplate } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/shared/loading-skeleton'
import { cn, formatDateTime, formatRelativeTime, avatarColor, initials } from '@/lib/utils'
import {
  Inbox as InboxIcon, Search, Send, MessageSquare, Mailbox, ChevronDown, ChevronRight,
  Archive, ArchiveRestore, MailOpen, MailCheck, Paperclip, Clock, Info, X, FileText, Plus,
  Square, CheckSquare, Download,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { RichTextEditor, RichTextEditorHandle } from './rich-text-editor'
import { ComposeModal } from './compose-modal'
import { ContactStatsPanel } from './contact-stats-panel'

const LEAD_STATUSES = [
  { value: 'none', label: 'No status', dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground' },
  { value: 'interested', label: 'Interested', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  { value: 'not_interested', label: 'Not Interested', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700' },
  { value: 'meeting_booked', label: 'Meeting Booked', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700' },
] as const

function leadStatusMeta(status: string) {
  return LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]
}

function attachmentUrl(url: string) {
  return url.startsWith('http') ? url : `${API_URL}${url}`
}

// Messages can come from external senders — never render their HTML directly.
// Strip tags and display as plain text so nothing can execute in the page.
function toPlainText(html: string, text: string): string {
  if (text) return text
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Email replies append the entire previous message below the new text
// ("On ... wrote:" + ">"-quoted lines, or "----- Original Message -----").
// Split that off so the chat view shows just the new reply by default.
function splitQuotedReply(text: string): { main: string; quoted: string } {
  const markers = [
    /\n?On .{1,120}wrote:\s*\n/i,
    /\n?-{2,}\s*Original Message\s*-{2,}/i,
    /\n?_{5,}\s*\nFrom:/i,
  ]
  for (const m of markers) {
    const match = text.match(m)
    if (match && match.index && match.index > 0) {
      return { main: text.slice(0, match.index).trim(), quoted: text.slice(match.index).trim() }
    }
  }
  const lines = text.split('\n')
  const quoteStart = lines.findIndex(l => l.trim().startsWith('>'))
  if (quoteStart > 0) {
    return { main: lines.slice(0, quoteStart).join('\n').trim(), quoted: lines.slice(quoteStart).join('\n').trim() }
  }
  return { main: text.trim(), quoted: '' }
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      className={cn('rounded-full flex items-center justify-center text-white font-semibold shrink-0', avatarColor(name))}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </div>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const SNOOZE_OPTIONS = [
  { label: '1 hour', get: () => addHours(new Date(), 1) },
  { label: 'Tomorrow, 9am', get: () => set(addDays(new Date(), 1), { hours: 9, minutes: 0, seconds: 0 }) },
  { label: 'Next week', get: () => set(addDays(new Date(), 7), { hours: 9, minutes: 0, seconds: 0 }) },
]

type ViewTab = 'inbox' | 'archived' | 'snoozed'

export default function InboxPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [view, setView] = useState<ViewTab>('inbox')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [replyHtml, setReplyHtml] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [includeSignature, setIncludeSignature] = useState(true)
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set())
  const [showStats, setShowStats] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const replyFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const toggleQuote = (id: number) => {
    setExpandedQuotes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const { data: smtpAccounts } = useQuery({
    queryKey: ['smtp-accounts-imap'],
    queryFn: () => smtpApi.getAll({ page_size: 100 }).then(r => (r.data.items || []).filter((a: SMTPAccount) => a.imap_enabled)),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-threads', accountFilter, statusFilter, view, debouncedSearch],
    queryFn: () => inboxApi.threads({
      page_size: 50,
      smtp_account_id: accountFilter || undefined,
      lead_status: statusFilter || undefined,
      is_archived: view === 'archived',
      snoozed: view === 'snoozed',
      search: debouncedSearch || undefined,
    }).then(r => r.data as PaginatedResponse<ThreadListItem>),
    refetchInterval: 15000,
  })

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['inbox-thread', selectedId],
    queryFn: () => inboxApi.getThread(selectedId as number).then(r => r.data as ThreadDetail),
    enabled: !!selectedId,
  })

  const { data: templates } = useQuery({
    queryKey: ['reply-templates'],
    queryFn: () => inboxApi.templates().then(r => r.data as ReplyTemplate[]),
  })

  const threads = data?.items || []

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [thread?.messages?.length])

  // Opening a thread marks it read on the backend — reflect that instantly
  // in the list and the sidebar badge instead of waiting for the next poll.
  useEffect(() => {
    if (!thread?.id) return

    const cached = qc.getQueriesData<PaginatedResponse<ThreadListItem>>({ queryKey: ['inbox-threads'] })
    const wasUnread = cached.some(([, d]) => d?.items.some(t => t.id === thread.id && t.is_unread))

    qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
      { queryKey: ['inbox-threads'] },
      old => old && {
        ...old,
        items: old.items.map(t => t.id === thread.id ? { ...t, is_unread: false } : t),
      }
    )
    if (wasUnread) {
      qc.setQueryData<{ count: number }>(['inbox-unread-count'], old =>
        old ? { count: Math.max(0, old.count - 1) } : old
      )
    }
    qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
    qc.invalidateQueries({ queryKey: ['inbox-unread-count'] })
  }, [thread?.id])

  const resetComposer = () => {
    setReplyHtml(''); setReplyText(''); setReplyFiles([])
    editorRef.current?.clear()
  }

  const replyMut = useMutation({
    mutationFn: () => inboxApi.reply(selectedId as number, {
      html_content: replyHtml, text_content: replyText, include_signature: includeSignature, files: replyFiles,
    }),
    onSuccess: () => {
      resetComposer()
      qc.invalidateQueries({ queryKey: ['inbox-thread', selectedId] })
      qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
      toast.success('Reply sent')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send reply'),
  })

  const statusMut = useMutation({
    mutationFn: (lead_status: string) => inboxApi.setStatus(selectedId as number, lead_status),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      qc.setQueryData<ThreadDetail>(['inbox-thread', selectedId], updated)
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && {
          ...old,
          items: old.items.map(t => t.id === updated.id ? { ...t, lead_status: updated.lead_status } : t),
        }
      )
      toast.success('Status updated')
    },
    onError: () => toast.error('Failed to update status'),
  })

  const archiveMut = useMutation({
    mutationFn: (is_archived: boolean) => inboxApi.setArchived(selectedId as number, is_archived),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      // Optimistic filter only removes from the *current* view's cache — it can't add
      // the thread back into another tab's already-cached list, so invalidate too.
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && { ...old, items: old.items.filter(t => t.id !== updated.id) }
      )
      qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
      setSelectedId(null)
      toast.success(updated.is_archived ? 'Conversation archived' : 'Conversation moved back to inbox')
    },
    onError: () => toast.error('Failed to update conversation'),
  })

  const readMut = useMutation({
    mutationFn: (is_unread: boolean) => inboxApi.setRead(selectedId as number, is_unread),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      qc.setQueryData<ThreadDetail>(['inbox-thread', selectedId], updated)
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && { ...old, items: old.items.map(t => t.id === updated.id ? { ...t, is_unread: updated.is_unread } : t) }
      )
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] })
    },
    onError: () => toast.error('Failed to update conversation'),
  })

  // Row-level quick actions (list hover buttons) — operate on whichever thread
  // id is passed in, independent of which thread (if any) is currently open.
  const quickReadMut = useMutation({
    mutationFn: (id: number) => inboxApi.setRead(id, false),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && { ...old, items: old.items.map(t => t.id === updated.id ? { ...t, is_unread: false } : t) }
      )
      if (selectedId === updated.id) qc.setQueryData<ThreadDetail>(['inbox-thread', selectedId], updated)
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] })
    },
    onError: () => toast.error('Failed to update conversation'),
  })

  const quickUnarchiveMut = useMutation({
    mutationFn: (id: number) => inboxApi.setArchived(id, false),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && { ...old, items: old.items.filter(t => t.id !== updated.id) }
      )
      qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
      if (selectedId === updated.id) setSelectedId(null)
      toast.success('Moved back to inbox')
    },
    onError: () => toast.error('Failed to update conversation'),
  })

  const snoozeMut = useMutation({
    mutationFn: (snoozed_until: string | null) => inboxApi.setSnooze(selectedId as number, snoozed_until),
    onSuccess: (res) => {
      const updated = res.data as ThreadDetail
      setSnoozeMenuOpen(false)
      qc.setQueriesData<PaginatedResponse<ThreadListItem>>(
        { queryKey: ['inbox-threads'] },
        old => old && { ...old, items: old.items.filter(t => t.id !== updated.id) }
      )
      qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
      setSelectedId(null)
      toast.success(updated.snoozed_until ? 'Conversation snoozed' : 'Conversation unsnoozed')
    },
    onError: () => toast.error('Failed to snooze conversation'),
  })

  const bulkMut = useMutation({
    mutationFn: ({ action, lead_status }: { action: string; lead_status?: string }) =>
      inboxApi.bulkAction(Array.from(selectedIds), action, lead_status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['inbox-unread-count'] })
      setSelectedIds(new Set())
      toast.success('Updated conversations')
    },
    onError: () => toast.error('Bulk action failed'),
  })

  const createTemplateMut = useMutation({
    mutationFn: (data: { name: string; body_html: string; body_text: string }) => inboxApi.createTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reply-templates'] })
      toast.success('Template saved')
    },
    onError: () => toast.error('Failed to save template'),
  })

  const deleteTemplateMut = useMutation({
    mutationFn: (id: number) => inboxApi.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reply-templates'] }),
  })

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Gmail-style keyboard nav: j/k to move, e to archive, Escape to deselect.
  // Disabled while typing in any input/textarea/contentEditable.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (!threads.length) return

      const idx = threads.findIndex(t => t.id === selectedId)
      if (e.key === 'j') {
        e.preventDefault()
        setSelectedId(threads[Math.min(threads.length - 1, idx + 1)]?.id ?? threads[0].id)
      } else if (e.key === 'k') {
        e.preventDefault()
        setSelectedId(threads[Math.max(0, idx - 1)]?.id ?? threads[0].id)
      } else if (e.key === 'e' && selectedId) {
        e.preventDefault()
        archiveMut.mutate(true)
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const unreadTotal = threads.filter(t => t.is_unread).length
  const replyDisabled = !replyText.trim() && !replyHtml.replace(/<[^>]+>/g, '').trim()
  const smtpAccount = smtpAccounts?.find((a: SMTPAccount) => a.id === thread?.smtp_account)

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/20">
      {/* Thread list */}
      <div className="w-[340px] border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Inbox</h1>
            <div className="flex items-center gap-2">
              {view === 'inbox' && unreadTotal > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {unreadTotal} unread
                </span>
              )}
              <Button size="icon-sm" className="rounded-lg" title="New email" onClick={() => setComposeOpen(true)}>
                <Plus size={14} />
              </Button>
            </div>
          </div>
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg w-fit">
            {(['inbox', 'archived', 'snoozed'] as ViewTab[]).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); setSelectedId(null); setSelectedIds(new Set()) }}
                className={cn('text-xs px-3 py-1 rounded-md transition-colors capitalize', view === v ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground')}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm rounded-lg"
            />
          </div>
          {smtpAccounts && smtpAccounts.length > 1 && (
            <Select
              value={accountFilter ? String(accountFilter) : 'all'}
              onValueChange={v => { setAccountFilter(v === 'all' ? null : Number(v)); setSelectedId(null) }}
            >
              <SelectTrigger className="h-8 text-xs rounded-lg">
                <Mailbox size={12} className="mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All mailboxes</SelectItem>
                {smtpAccounts.map((a: SMTPAccount) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStatusFilter(null)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-full border transition-colors',
                !statusFilter ? 'bg-primary/10 text-primary border-primary/30' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              All
            </button>
            {LEAD_STATUSES.filter(s => s.value !== 'none').map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(prev => (prev === s.value ? null : s.value))}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-full border flex items-center gap-1 transition-colors',
                  statusFilter === s.value ? s.badge + ' border-transparent' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="px-3 py-2 border-b bg-primary/5 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkMut.mutate({ action: 'mark_read' })}>Mark read</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkMut.mutate({ action: 'mark_unread' })}>Mark unread</Button>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => bulkMut.mutate({ action: view === 'archived' ? 'unarchive' : 'archive' })}
            >
              {view === 'archived' ? 'Unarchive' : 'Archive'}
            </Button>
            <Select onValueChange={v => bulkMut.mutate({ action: 'set_status', lead_status: v })}>
              <SelectTrigger className="h-7 text-xs w-[110px] rounded-md">
                <SelectValue placeholder="Set status" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground ml-auto">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-2">
                  <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title={debouncedSearch ? 'No matches' : view !== 'inbox' ? `No ${view} conversations` : 'No conversations yet'}
              description={
                debouncedSearch
                  ? 'No conversations match your search.'
                  : view === 'archived'
                  ? 'Conversations you archive will show up here.'
                  : view === 'snoozed'
                  ? 'Conversations you snooze will show up here until they resurface.'
                  : 'Replies to your campaigns and sequences will show up here once IMAP reply detection is enabled on an SMTP account.'
              }
            />
          ) : (
            threads.map(t => {
              const name = t.contact_name || t.contact_email
              const checked = selectedIds.has(t.id)
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 border-b flex gap-2 hover:bg-muted/60 transition-colors cursor-pointer group',
                    selectedId === t.id && 'bg-primary/5 hover:bg-primary/5'
                  )}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelected(t.id) }}
                    className="shrink-0 mt-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {checked ? <CheckSquare size={15} className="text-primary" /> : <Square size={15} />}
                  </button>
                  <Avatar name={name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm truncate', t.is_unread ? 'font-semibold' : 'font-medium text-foreground/90')}>
                        {name}
                      </p>
                      <span className="text-[11px] text-muted-foreground shrink-0">{formatRelativeTime(t.last_message_at)}</span>
                    </div>
                    <p className={cn('text-xs truncate mt-0.5', t.is_unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {t.subject || '(no subject)'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.last_message_preview}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {smtpAccounts && smtpAccounts.length > 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <Mailbox size={9} />
                          {t.smtp_account_name}
                        </span>
                      )}
                      {t.lead_status !== 'none' && (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded', leadStatusMeta(t.lead_status).badge)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', leadStatusMeta(t.lead_status).dot)} />
                          {leadStatusMeta(t.lead_status).label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="relative w-2 h-2 mt-1.5">
                      {t.is_unread && (
                        <span className="absolute inset-0 rounded-full bg-primary group-hover:opacity-0 transition-opacity" />
                      )}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1">
                      {t.is_unread && (
                        <button
                          onClick={e => { e.stopPropagation(); quickReadMut.mutate(t.id) }}
                          title="Mark as read"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <MailCheck size={14} />
                        </button>
                      )}
                      {view === 'archived' && (
                        <button
                          onClick={e => { e.stopPropagation(); quickUnarchiveMut.mutate(t.id) }}
                          title="Move to inbox"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        >
                          <ArchiveRestore size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Conversation panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={MessageSquare} title="Select a conversation" description="Pick a thread from the left to view the full conversation." />
          </div>
        ) : threadLoading || !thread ? (
          <div className="flex-1 flex items-center justify-center">
            <Skeleton className="w-32 h-4" />
          </div>
        ) : (
          <>
            <div className="px-5 py-3.5 border-b bg-card flex items-center gap-2">
              <Avatar name={thread.contact_name || thread.contact_email} size={32} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{thread.contact_name || thread.contact_email}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                  <span>{thread.contact_email}</span>
                  <span className="opacity-50">•</span>
                  <Mailbox size={11} className="shrink-0" />
                  <span className="truncate">{thread.smtp_account_name}</span>
                </p>
              </div>
              <Select
                value={thread.lead_status}
                onValueChange={v => statusMut.mutate(v)}
              >
                <SelectTrigger className="h-8 text-xs rounded-lg w-[150px] shrink-0">
                  <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', leadStatusMeta(thread.lead_status).dot)} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showStats ? 'default' : 'outline'}
                size="icon-sm"
                className="rounded-lg shrink-0"
                title="Contact activity"
                onClick={() => setShowStats(v => !v)}
              >
                <Info size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-lg shrink-0"
                title={thread.is_unread ? 'Mark as read' : 'Mark as unread'}
                loading={readMut.isPending}
                onClick={() => readMut.mutate(!thread.is_unread)}
              >
                {thread.is_unread ? <MailCheck size={14} /> : <MailOpen size={14} />}
              </Button>
              <div className="relative">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-lg shrink-0"
                  title="Snooze"
                  onClick={() => setSnoozeMenuOpen(v => !v)}
                >
                  <Clock size={14} />
                </Button>
                {snoozeMenuOpen && (
                  <div className="absolute right-0 mt-1 w-44 border rounded-lg bg-card shadow-md z-10 py-1">
                    {SNOOZE_OPTIONS.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => snoozeMut.mutate(opt.get().toISOString())}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60"
                      >
                        {opt.label}
                      </button>
                    ))}
                    {thread.snoozed_until && (
                      <button
                        onClick={() => snoozeMut.mutate(null)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 text-destructive"
                      >
                        Remove snooze
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-lg shrink-0"
                title={thread.is_archived ? 'Move back to inbox' : 'Archive conversation'}
                loading={archiveMut.isPending}
                onClick={() => archiveMut.mutate(!thread.is_archived)}
              >
                {thread.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </Button>
            </div>

            <div className="flex-1 flex min-w-0">
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-w-0">
                {thread.messages.map(m => {
                  const { main, quoted } = splitQuotedReply(toPlainText(m.body_html, m.body_text))
                  const expanded = expandedQuotes.has(m.id)
                  return (
                    <div key={m.id} className={cn('flex gap-2', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                      {m.direction === 'inbound' && <Avatar name={thread.contact_name || thread.contact_email} size={28} />}
                      <div className={cn(
                        'max-w-[65%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                        m.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-card border rounded-bl-md'
                      )}>
                        {m.subject && (
                          <p className={cn('text-[11px] font-medium mb-1 opacity-70')}>{m.subject}</p>
                        )}
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {main || <span className="opacity-60 italic">(no content)</span>}
                        </div>
                        {m.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {m.attachments.map(att => (
                              <a
                                key={att.id}
                                href={attachmentUrl(att.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  'inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border',
                                  m.direction === 'outbound' ? 'border-primary-foreground/30 hover:bg-primary-foreground/10' : 'border-border hover:bg-muted'
                                )}
                              >
                                <Paperclip size={11} />
                                <span className="truncate max-w-[140px]">{att.filename}</span>
                                <span className="opacity-60">{formatBytes(att.size)}</span>
                                <Download size={10} />
                              </a>
                            ))}
                          </div>
                        )}
                        {quoted && (
                          <>
                            <button
                              onClick={() => toggleQuote(m.id)}
                              className={cn(
                                'flex items-center gap-1 text-[11px] mt-1.5 opacity-70 hover:opacity-100 transition-opacity',
                                m.direction === 'outbound' ? 'text-primary-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                              {expanded ? 'Hide quoted text' : 'Show quoted text'}
                            </button>
                            {expanded && (
                              <div className={cn(
                                'whitespace-pre-wrap break-words leading-relaxed mt-1.5 pt-1.5 border-t text-[12px] opacity-70',
                                m.direction === 'outbound' ? 'border-primary-foreground/20' : 'border-border'
                              )}>
                                {quoted}
                              </div>
                            )}
                          </>
                        )}
                        <p className={cn('text-[10px] mt-1.5', m.direction === 'outbound' ? 'opacity-70' : 'text-muted-foreground')}>
                          {formatDateTime(m.occurred_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {showStats && <ContactStatsPanel threadId={thread.id} />}
            </div>

            <div className="p-4 border-t bg-card space-y-2.5">
              <RichTextEditor
                ref={editorRef}
                placeholder={`Reply to ${thread.contact_name || thread.contact_email}…`}
                onChange={(html, text) => { setReplyHtml(html); setReplyText(text) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !replyDisabled) {
                    e.preventDefault()
                    replyMut.mutate()
                  }
                }}
              />
              {replyFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {replyFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-muted px-2 py-1 rounded-full">
                      {f.name}
                      <button onClick={() => setReplyFiles(fs => fs.filter((_, idx) => idx !== i))}>
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
                    onClick={() => replyFileInputRef.current?.click()}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Paperclip size={13} /> Attach
                  </button>
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => setReplyFiles(fs => [...fs, ...Array.from(e.target.files || [])])}
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTemplatesOpen(v => !v)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <FileText size={13} /> Templates
                    </button>
                    {templatesOpen && (
                      <div className="absolute left-0 bottom-full mb-1 w-56 border rounded-lg bg-card shadow-md z-10 py-1 max-h-60 overflow-y-auto">
                        {(templates || []).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No saved templates yet.</p>
                        )}
                        {(templates || []).map(tpl => (
                          <div key={tpl.id} className="flex items-center justify-between group hover:bg-muted/60">
                            <button
                              onClick={() => { editorRef.current?.insertHTML(tpl.body_html || tpl.body_text); setTemplatesOpen(false) }}
                              className="flex-1 text-left px-3 py-1.5 text-xs truncate"
                            >
                              {tpl.name}
                            </button>
                            <button
                              onClick={() => deleteTemplateMut.mutate(tpl.id)}
                              className="px-2 text-muted-foreground opacity-0 group-hover:opacity-100"
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button
                            onClick={() => {
                              const name = window.prompt('Template name')
                              if (name) createTemplateMut.mutate({ name, body_html: replyHtml, body_text: replyText })
                              setTemplatesOpen(false)
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-primary"
                          >
                            + Save current draft as template
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {smtpAccount?.signature_html && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={includeSignature} onChange={e => setIncludeSignature(e.target.checked)} />
                      Signature
                    </label>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={replyDisabled}
                  loading={replyMut.isPending}
                  onClick={() => replyMut.mutate()}
                  className="rounded-lg"
                >
                  <Send size={14} /> Send Reply
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Sending via {thread.smtp_account_name} · ⌘/Ctrl+Enter to send</p>
            </div>
          </>
        )}
      </div>

      {smtpAccounts && (
        <ComposeModal
          open={composeOpen}
          onOpenChange={setComposeOpen}
          smtpAccounts={smtpAccounts}
          onSent={() => qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'all' })}
        />
      )}
    </div>
  )
}
