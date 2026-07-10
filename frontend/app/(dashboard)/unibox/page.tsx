'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { addDays, addHours, set } from 'date-fns'
import { inboxApi, smtpApi } from '@/lib/api'
import { ThreadListItem, ThreadDetail, PaginatedResponse, SMTPAccount } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/shared/loading-skeleton'
import { cn, formatDateTime, formatRelativeTime, avatarColor, initials } from '@/lib/utils'
import {
  Inbox as InboxIcon, Search, Send, MessageSquare, Mailbox,
  Archive, ArchiveRestore, MailOpen, MailCheck, Paperclip, Clock, X, Plus,
  Square, CheckSquare, UserPlus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { RichTextEditor, RichTextEditorHandle } from './rich-text-editor'
import { ComposeModal } from './compose-modal'
import { ContactStatsPanel } from './contact-stats-panel'
import { MessageBubble } from './message-bubble'

const LEAD_STATUSES = [
  { value: 'none', label: 'No status', dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground' },
  { value: 'interested', label: 'Interested', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  { value: 'not_interested', label: 'Not Interested', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700' },
  { value: 'meeting_booked', label: 'Meeting Booked', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700' },
] as const

function leadStatusMeta(status: string) {
  return LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]
}

// Mirrors the backend's FOLLOW_UP_DAYS/NO_FOLLOW_UP_STATUSES in apps/inbox/services.py —
// used only to render the row badge instantly; the actual filter is server-side.
const FOLLOW_UP_DAYS = 3
const NO_FOLLOW_UP_STATUSES = new Set(['not_interested', 'meeting_booked'])

function isDueFollowup(t: { last_message_direction: string; last_message_at: string | null; lead_status: string }) {
  if (t.last_message_direction !== 'outbound' || !t.last_message_at) return false
  if (NO_FOLLOW_UP_STATUSES.has(t.lead_status)) return false
  const days = (Date.now() - new Date(t.last_message_at).getTime()) / (1000 * 60 * 60 * 24)
  return days >= FOLLOW_UP_DAYS
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

const SNOOZE_OPTIONS = [
  { label: '1 hour', get: () => addHours(new Date(), 1) },
  { label: 'Tomorrow, 9am', get: () => set(addDays(new Date(), 1), { hours: 9, minutes: 0, seconds: 0 }) },
  { label: 'Next week', get: () => set(addDays(new Date(), 7), { hours: 9, minutes: 0, seconds: 0 }) },
]

type ViewTab = 'inbox' | 'archived' | 'snoozed'

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  )
}

function InboxPageInner() {
  const qc = useQueryClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [campaignFilter, setCampaignFilter] = useState<number | null>(() => {
    const raw = searchParams.get('campaign_id')
    return raw ? Number(raw) : null
  })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [dueFollowupOnly, setDueFollowupOnly] = useState(false)
  const [view, setView] = useState<ViewTab>('inbox')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [replyHtml, setReplyHtml] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [includeSignature, setIncludeSignature] = useState(true)
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set())
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
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

  const THREADS_PAGE_SIZE = 50
  const [threadsLimit, setThreadsLimit] = useState(THREADS_PAGE_SIZE)

  // Collapse back to the first page whenever the filter set changes, so
  // switching views/filters doesn't keep a stale "loaded more" window.
  useEffect(() => {
    setThreadsLimit(THREADS_PAGE_SIZE)
  }, [accountFilter, statusFilter, dueFollowupOnly, view, debouncedSearch, campaignFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-threads', accountFilter, statusFilter, dueFollowupOnly, view, debouncedSearch, campaignFilter, threadsLimit],
    queryFn: () => inboxApi.threads({
      page_size: threadsLimit,
      smtp_account_id: accountFilter || undefined,
      lead_status: statusFilter || undefined,
      due_followup: dueFollowupOnly || undefined,
      is_archived: view === 'archived',
      snoozed: view === 'snoozed',
      search: debouncedSearch || undefined,
      campaign_id: campaignFilter || undefined,
    }).then(r => r.data as PaginatedResponse<ThreadListItem>),
    refetchInterval: 15000,
  })

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['inbox-thread', selectedId],
    queryFn: () => inboxApi.getThread(selectedId as number).then(r => r.data as ThreadDetail),
    enabled: !!selectedId,
  })

  const threads = data?.items || []

  // scrollHeight read synchronously here can be stale — a message's image/
  // attachment chip may not have finished laying out yet, undershooting the
  // scroll target. requestAnimationFrame defers until after that layout pass.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    })
    return () => cancelAnimationFrame(frame)
  }, [thread?.id, thread?.messages?.length])

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
    // Mark stale but DON'T force an immediate refetch — the optimistic updates
    // above already reflect the read state, and firing a full list refetch on
    // every thread open competes with the detail request for the (few) sync
    // workers, which is what makes opening a thread feel slow. The 15s poll
    // reconciles anyway.
    qc.invalidateQueries({ queryKey: ['inbox-threads'], refetchType: 'none' })
    qc.invalidateQueries({ queryKey: ['inbox-unread-count'], refetchType: 'none' })
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


  const followupDraftMut = useMutation({
    mutationFn: () => inboxApi.followupDraft(selectedId as number),
    onSuccess: (res) => {
      const { html_content, text_content } = res.data as { html_content: string; text_content: string }
      editorRef.current?.clear()
      editorRef.current?.insertHTML(html_content)
      setReplyHtml(html_content)
      setReplyText(text_content)
      toast.success('Follow-up draft inserted — review before sending')
    },
    onError: () => toast.error('Failed to generate follow-up draft'),
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
    <div className="flex h-full min-h-0 overflow-hidden bg-muted/20">
      {/* Thread list */}
      <div className="w-[340px] border-r bg-card flex flex-col shrink-0 min-h-0">
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
          {campaignFilter && (
            <div className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary">
              <span>Filtered to one campaign's leads</span>
              <button
                onClick={() => { setCampaignFilter(null); router.replace('/unibox') }}
                className="hover:underline font-medium shrink-0"
              >
                Clear
              </button>
            </div>
          )}
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
            {view === 'inbox' && (
              <button
                onClick={() => setDueFollowupOnly(v => !v)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-full border flex items-center gap-1 transition-colors',
                  dueFollowupOnly ? 'bg-amber-50 text-amber-700 border-transparent' : 'text-muted-foreground hover:bg-muted'
                )}
                title={`Sent by you, no reply for ${FOLLOW_UP_DAYS}+ days`}
              >
                <Clock size={11} />
                Needs follow-up
              </button>
            )}
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

        <div className="flex-1 overflow-y-auto min-h-0">
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
              title={
                debouncedSearch ? 'No matches'
                  : dueFollowupOnly ? 'Nothing needs a follow-up'
                  : view !== 'inbox' ? `No ${view} conversations`
                  : 'No conversations yet'
              }
              description={
                debouncedSearch
                  ? 'No conversations match your search.'
                  : dueFollowupOnly
                  ? `Threads you sent last with no reply for ${FOLLOW_UP_DAYS}+ days will show up here.`
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
                    'relative w-full text-left px-3 py-3.5 border-b flex gap-2.5 hover:bg-muted/50 transition-colors cursor-pointer group border-l-2',
                    selectedId === t.id ? 'bg-primary/5 hover:bg-primary/5 border-l-primary' : 'border-l-transparent',
                    t.is_unread && selectedId !== t.id && 'border-l-primary/60'
                  )}
                >
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelected(t.id) }}
                    className="shrink-0 mt-1 text-muted-foreground hover:text-foreground"
                  >
                    {checked ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                  </button>
                  <Avatar name={name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn('text-sm truncate leading-tight', t.is_unread ? 'font-semibold' : 'font-medium')}>
                          {name}
                        </p>
                        {t.contact_name && (
                          <p className="text-[11px] text-muted-foreground truncate">{t.contact_email}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{formatRelativeTime(t.last_message_at)}</span>
                    </div>
                    <p className={cn('text-xs truncate mt-1', t.is_unread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                      {t.subject || '(no subject)'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-snug">{t.last_message_preview}</p>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {smtpAccounts && smtpAccounts.length > 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <Mailbox size={9} />
                          {t.smtp_account_name}
                        </span>
                      )}
                      {t.is_cold_lead && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700"
                          title="Emailed in first — no prior campaign, sequence, or manual send to this contact"
                        >
                          <UserPlus size={9} />
                          New sender
                        </span>
                      )}
                      {t.lead_status !== 'none' && (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded', leadStatusMeta(t.lead_status).badge)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', leadStatusMeta(t.lead_status).dot)} />
                          {leadStatusMeta(t.lead_status).label}
                        </span>
                      )}
                      {isDueFollowup(t) && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                          <Clock size={9} />
                          Follow-up
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="hidden group-hover:flex flex-col items-end gap-1 shrink-0">
                    {t.is_unread && (
                      <button
                        onClick={e => { e.stopPropagation(); quickReadMut.mutate(t.id) }}
                        title="Mark as read"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <MailCheck size={13} />
                      </button>
                    )}
                    {view === 'archived' && (
                      <button
                        onClick={e => { e.stopPropagation(); quickUnarchiveMut.mutate(t.id) }}
                        title="Move to inbox"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <ArchiveRestore size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
          {data && data.count > threads.length && (
            <div className="p-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setThreadsLimit(l => l + THREADS_PAGE_SIZE)}>
                Load more ({(data.count - threads.length).toLocaleString()} remaining)
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Conversation panel */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
            <div className="px-5 py-3 border-b bg-card flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                  {thread.contact_name || thread.contact_email}
                  {thread.is_cold_lead && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 shrink-0"
                      title="Emailed in first — no prior campaign, sequence, or manual send to this contact"
                    >
                      <UserPlus size={9} />
                      New sender
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{thread.subject || '(no subject)'}</p>
              </div>
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

            <div className="flex-1 flex min-w-0 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-w-0 min-h-0">
                {thread.messages.map(m => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    contactName={thread.contact_name || thread.contact_email}
                    expanded={expandedQuotes.has(m.id)}
                    onToggleQuote={() => toggleQuote(m.id)}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
              <ContactStatsPanel threadId={thread.id} thread={thread} onStatusChange={v => statusMut.mutate(v)} />
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
                  {thread.last_message_direction === 'outbound' && (
                    <button
                      type="button"
                      onClick={() => followupDraftMut.mutate()}
                      disabled={followupDraftMut.isPending}
                      className="text-xs text-amber-700 hover:text-amber-800 flex items-center gap-1 disabled:opacity-60"
                    >
                      <Clock size={13} /> {followupDraftMut.isPending ? 'Generating…' : 'Suggest follow-up'}
                    </button>
                  )}
                  {smtpAccount?.signature_html && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox checked={includeSignature} onChange={e => setIncludeSignature(e.target.checked)} />
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
