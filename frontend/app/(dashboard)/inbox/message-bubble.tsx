'use client'
import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { InboxMessage } from '@/lib/types'
import { inboxApi } from '@/lib/api'
import { cn, formatDateTime, avatarColor, initials } from '@/lib/utils'
import { ChevronDown, ChevronRight, Paperclip, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const QUOTE_SELECTOR = [
  'blockquote',
  '.gmail_quote',
  '.gmail_quote_container',
  '.moz-cite-prefix',
  '.yahoo_quoted',
  '#divRplyFwdMsg',
  '.OutlookMessageHeader',
].join(',')

const ATTRIBUTION_RE = /^On .{1,150}wrote:\s*$/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function splitHtmlQuote(html: string): { mainHtml: string; quotedHtml: string } {
  if (typeof window === 'undefined' || !html) return { mainHtml: html, quotedHtml: '' }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const quoteEl = doc.body.querySelector(QUOTE_SELECTOR)
  if (!quoteEl) return { mainHtml: doc.body.innerHTML, quotedHtml: '' }

  let startEl: Element = quoteEl
  const prev = quoteEl.previousElementSibling
  if (prev && ATTRIBUTION_RE.test((prev.textContent || '').trim())) {
    startEl = prev
  }

  const removed: Element[] = []
  let node: Element | null = startEl
  while (node) {
    removed.push(node)
    node = node.nextElementSibling
  }
  const quotedHtml = removed.map(n => n.outerHTML).join('')
  removed.forEach(n => n.remove())
  return { mainHtml: doc.body.innerHTML, quotedHtml }
}

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'a', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'blockquote']

function sanitizeForDisplay(html: string): string {
  if (typeof window === 'undefined' || !html) return ''
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['href'], ALLOW_DATA_ATTR: false })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || ''
    if (!/^(https?:|mailto:)/i.test(href)) {
      a.removeAttribute('href')
    } else {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return doc.body.innerHTML.trim()
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  message: InboxMessage
  contactName: string
  expanded: boolean
  onToggleQuote: () => void
}

export function MessageBubble({ message: m, contactName, expanded, onToggleQuote }: Props) {
  const outbound = m.direction === 'outbound'
  const senderName = outbound ? 'You' : (contactName || m.from_email)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const downloadAttachment = async (id: number, filename: string) => {
    setDownloadingId(id)
    try {
      const res = await inboxApi.downloadAttachment(id)
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download attachment')
    } finally {
      setDownloadingId(null)
    }
  }

  const { mainHtml, quotedHtml } = useMemo(() => {
    const source = m.body_html || escapeHtml(m.body_text)
    const { mainHtml: main, quotedHtml: quoted } = splitHtmlQuote(source)
    return { mainHtml: sanitizeForDisplay(main), quotedHtml: quoted ? sanitizeForDisplay(quoted) : '' }
  }, [m.body_html, m.body_text])

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden shadow-sm',
      outbound
        ? 'border-primary/20 bg-primary/3'
        : 'border-border bg-card'
    )}>
      {/* Email header */}
      <div className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5 border-b',
        outbound ? 'border-primary/15 bg-primary/5' : 'border-border bg-muted/30'
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0',
            outbound ? 'bg-primary' : avatarColor(senderName)
          )}>
            {outbound ? 'Me' : initials(senderName)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold">{senderName}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {outbound ? `to ${m.to_email}` : m.from_email}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(m.occurred_at)}</p>
      </div>

      {/* Email body */}
      <div className="px-4 py-4">
        <div
          className="text-sm leading-relaxed wrap-break-word [&_p]:my-1.5 [&_div]:my-0 [&_ul]:my-1 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline first:*:mt-0 last:*:mb-0"
          dangerouslySetInnerHTML={{ __html: mainHtml || '<span class="text-muted-foreground italic text-xs">(no content)</span>' }}
        />

        {m.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
            {m.attachments.map(att => (
              <button
                key={att.id}
                onClick={() => downloadAttachment(att.id, att.filename)}
                disabled={downloadingId === att.id}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border bg-muted/50 hover:bg-muted disabled:opacity-60 transition-colors"
              >
                <Paperclip size={11} />
                <span className="truncate max-w-[140px]">{att.filename}</span>
                <span className="text-muted-foreground">{formatBytes(att.size)}</span>
                {downloadingId === att.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
              </button>
            ))}
          </div>
        )}

        {quotedHtml && (
          <>
            <button
              onClick={onToggleQuote}
              className="flex items-center gap-1 text-[11px] mt-2.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Hide quoted text' : 'Show quoted text'}
            </button>
            {expanded && (
              <div
                className="mt-2 pt-2 border-t text-[12px] text-muted-foreground leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:ml-1 [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: quotedHtml }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
