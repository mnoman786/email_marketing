'use client'
import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { InboxMessage } from '@/lib/types'
import { inboxApi } from '@/lib/api'
import { cn, formatDateTime, avatarColor, initials } from '@/lib/utils'
import { ChevronDown, ChevronRight, Paperclip, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

// Structural markers different mail clients wrap quoted history in. Far more
// reliable than guessing from flattened plain text, which loses line breaks
// and silently fails the moment a client hard-wraps the attribution line.
const QUOTE_SELECTOR = [
  'blockquote',
  '.gmail_quote',
  '.gmail_quote_container',
  '.moz-cite-prefix',
  '.yahoo_quoted',
  '#divRplyFwdMsg',
  '.OutlookMessageHeader',
].join(',')

// Apple Mail / Outlook Web / Yahoo put the "On ... wrote:" attribution as a
// plain sibling just before the quote container rather than inside it.
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
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  // The download endpoint requires a Bearer token, which a plain <a href> can't
  // send — fetch it through the authenticated axios instance and save the blob.
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
    <div className={cn('flex gap-2', outbound ? 'justify-end' : 'justify-start')}>
      {!outbound && (
        <div
          className={cn('rounded-full flex items-center justify-center text-white font-semibold shrink-0', avatarColor(contactName))}
          style={{ width: 28, height: 28, fontSize: 28 * 0.4 }}
        >
          {initials(contactName)}
        </div>
      )}
      <div className={cn(
        'max-w-[65%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
        outbound ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border rounded-bl-md'
      )}>
        {m.subject && <p className="text-[11px] font-medium mb-1 opacity-70">{m.subject}</p>}

        <div
          className={cn(
            'leading-relaxed break-words [&_p]:my-1.5 [&_div]:my-0 [&_ul]:my-1 [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:pl-5 [&_a]:underline first:[&>*]:mt-0 last:[&>*]:mb-0',
            outbound ? '[&_a]:text-primary-foreground' : '[&_a]:text-primary'
          )}
          dangerouslySetInnerHTML={{ __html: mainHtml || '<span class="opacity-60 italic">(no content)</span>' }}
        />

        {m.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {m.attachments.map(att => (
              <button
                key={att.id}
                onClick={() => downloadAttachment(att.id, att.filename)}
                disabled={downloadingId === att.id}
                className={cn(
                  'inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border disabled:opacity-60',
                  outbound ? 'border-primary-foreground/30 hover:bg-primary-foreground/10' : 'border-border hover:bg-muted'
                )}
              >
                <Paperclip size={11} />
                <span className="truncate max-w-[140px]">{att.filename}</span>
                <span className="opacity-60">{formatBytes(att.size)}</span>
                {downloadingId === att.id ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
              </button>
            ))}
          </div>
        )}

        {quotedHtml && (
          <>
            <button
              onClick={onToggleQuote}
              className={cn(
                'flex items-center gap-1 text-[11px] mt-1.5 opacity-70 hover:opacity-100 transition-opacity',
                outbound ? 'text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {expanded ? 'Hide quoted text' : 'Show quoted text'}
            </button>
            {expanded && (
              <div
                className={cn(
                  'leading-relaxed break-words mt-1.5 pt-1.5 border-t text-[12px] opacity-70 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:ml-1 [&_p]:my-1',
                  outbound ? 'border-primary-foreground/20' : 'border-border'
                )}
                dangerouslySetInnerHTML={{ __html: quotedHtml }}
              />
            )}
          </>
        )}

        <p className={cn('text-[10px] mt-1.5', outbound ? 'opacity-70' : 'text-muted-foreground')}>
          {formatDateTime(m.occurred_at)}
        </p>
      </div>
    </div>
  )
}
