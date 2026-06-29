'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inboxApi, smtpApi } from '@/lib/api'
import { ThreadListItem, ThreadDetail, PaginatedResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { Skeleton } from '@/components/shared/loading-skeleton'
import { cn, formatDateTime, formatRelativeTime, avatarColor, initials } from '@/lib/utils'
import { Inbox as InboxIcon, Search, Send, MessageSquare, Mailbox, ChevronDown, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

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

export default function InboxPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [replyHtml, setReplyHtml] = useState('')
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleQuote = (id: number) => {
    setExpandedQuotes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const { data: smtpAccounts } = useQuery({
    queryKey: ['smtp-accounts-imap'],
    queryFn: () => smtpApi.getAll({ page_size: 100 }).then(r => (r.data.items || []).filter((a: any) => a.imap_enabled)),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-threads', accountFilter],
    queryFn: () => inboxApi.threads({ page_size: 50, smtp_account_id: accountFilter || undefined }).then(r => r.data as PaginatedResponse<ThreadListItem>),
    refetchInterval: 15000,
  })

  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: ['inbox-thread', selectedId],
    queryFn: () => inboxApi.getThread(selectedId as number).then(r => r.data as ThreadDetail),
    enabled: !!selectedId,
  })

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
    qc.invalidateQueries({ queryKey: ['inbox-threads'] })
    qc.invalidateQueries({ queryKey: ['inbox-unread-count'] })
  }, [thread?.id])

  const replyMut = useMutation({
    mutationFn: () => inboxApi.reply(selectedId as number, { html_content: replyHtml, text_content: replyHtml }),
    onSuccess: () => {
      setReplyHtml('')
      qc.invalidateQueries({ queryKey: ['inbox-thread', selectedId] })
      qc.invalidateQueries({ queryKey: ['inbox-threads'] })
      toast.success('Reply sent')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to send reply'),
  })

  const threads = (data?.items || []).filter(t =>
    !search || t.contact_name?.toLowerCase().includes(search.toLowerCase()) || t.contact_email?.toLowerCase().includes(search.toLowerCase())
  )
  const unreadTotal = (data?.items || []).filter(t => t.is_unread).length

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/20">
      {/* Thread list */}
      <div className="w-[340px] border-r bg-card flex flex-col shrink-0">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Inbox</h1>
            {unreadTotal > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {unreadTotal} unread
              </span>
            )}
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
                {smtpAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

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
              title="No conversations yet"
              description="Replies to your campaigns and sequences will show up here once IMAP reply detection is enabled on an SMTP account."
            />
          ) : (
            threads.map(t => {
              const name = t.contact_name || t.contact_email
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 border-b flex gap-3 hover:bg-muted/60 transition-colors',
                    selectedId === t.id && 'bg-primary/5 hover:bg-primary/5'
                  )}
                >
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
                    {smtpAccounts && smtpAccounts.length > 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">
                        <Mailbox size={9} />
                        {t.smtp_account_name}
                      </span>
                    )}
                  </div>
                  {t.is_unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </button>
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
            <div className="px-5 py-3.5 border-b bg-card flex items-center gap-3">
              <Avatar name={thread.contact_name || thread.contact_email} size={32} />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{thread.contact_name || thread.contact_email}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                  <span>{thread.contact_email}</span>
                  <span className="opacity-50">•</span>
                  <Mailbox size={11} className="shrink-0" />
                  <span className="truncate">{thread.smtp_account_name}</span>
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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

            <div className="p-4 border-t bg-card space-y-2.5">
              <Textarea
                value={replyHtml}
                onChange={e => setReplyHtml(e.target.value)}
                placeholder={`Reply to ${thread.contact_name || thread.contact_email}…`}
                className="text-sm h-20 rounded-xl resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && replyHtml.trim()) {
                    e.preventDefault()
                    replyMut.mutate()
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Sending via {thread.smtp_account_name} · ⌘/Ctrl+Enter to send</p>
                <Button
                  size="sm"
                  disabled={!replyHtml.trim()}
                  loading={replyMut.isPending}
                  onClick={() => replyMut.mutate()}
                  className="rounded-lg"
                >
                  <Send size={14} /> Send Reply
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
