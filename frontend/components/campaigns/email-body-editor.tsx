'use client'
import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Underline, Link as LinkIcon, Shuffle, ChevronDown, Check, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Flags HTML that genuinely hurts cold-email deliverability.
// Excludes <div> and <br> — browsers insert those naturally for line breaks in contentEditable.
const COMPLEX_HTML_RE = /<(img|table|td|tr|style|head|html|center|font)\b/i

const CONTACT_TAGS = [
  { label: 'First Name',    tag: 'first_name' },
  { label: 'Last Name',     tag: 'last_name'  },
  { label: 'Full Name',     tag: 'full_name'  },
  { label: 'Company',       tag: 'company'    },
  { label: 'Job Title',     tag: 'title'      },
  { label: 'Email',         tag: 'email'      },
  { label: 'Phone',         tag: 'phone'      },
  { label: 'Website',       tag: 'website'    },
  { label: 'City',          tag: 'city'       },
  { label: 'State',         tag: 'state'      },
  { label: 'Country',       tag: 'country'    },
]

const SENDER_TAGS = [
  { label: 'Your Name',     tag: 'sender_name'       },
  { label: 'Your Email',    tag: 'sender_email'      },
  { label: 'Your Company',  tag: 'sender_company'    },
]

// Flat list used by the { } autocomplete
const MERGE_TAGS = [...CONTACT_TAGS, ...SENDER_TAGS]

// Items shown in the { } autocomplete popup.
const AUTOCOMPLETE_ITEMS = [
  ...MERGE_TAGS.map(t => ({ label: t.label, insert: `{{${t.tag}}}`, hint: `{{${t.tag}}}` })),
  { label: 'Spintax', insert: '{Option A|Option B}', hint: '{a|b|c}' },
]

interface AutocompleteState {
  query: string         // what the user typed after {
  top: number           // px from top of editor container
  left: number
  activeIndex: number
}

interface Props {
  value: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  className?: string
}

export function EmailBodyEditor({ value, onChange, placeholder, className }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [complexHtml, setComplexHtml] = useState(() => COMPLEX_HTML_RE.test(value || ''))
  const [linkUrl, setLinkUrl] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const [ac, setAc] = useState<AutocompleteState | null>(null)
  const acRef = useRef<HTMLDivElement>(null)
  // Tracks the last HTML this editor itself emitted, so the sync effect below
  // can tell "value changed because I typed" (skip — would reset the caret)
  // apart from "value changed from outside" (e.g. a template was picked —
  // sync it in). Starts at null so the very first mount always syncs.
  const lastEmitted = useRef<string | null>(null)

  useEffect(() => {
    if (!divRef.current) return
    if (value !== lastEmitted.current) {
      divRef.current.innerHTML = value || ''
      lastEmitted.current = value
    }
  }, [value])

  // Track caret continuously while editor has focus.
  useEffect(() => {
    const save = () => {
      if (!divRef.current) return
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0 && divRef.current.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange()
      }
    }
    document.addEventListener('selectionchange', save)
    return () => document.removeEventListener('selectionchange', save)
  }, [])

  // Close dropdowns on outside click.
  useEffect(() => {
    if (!tagsOpen && !linkMode) return
    const close = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setTagsOpen(false)
        setLinkMode(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tagsOpen, linkMode])

  useEffect(() => {
    if (linkMode) setTimeout(() => linkInputRef.current?.focus(), 0)
  }, [linkMode])

  const emit = () => {
    if (!divRef.current) return
    const html = divRef.current.innerHTML
    lastEmitted.current = html
    setComplexHtml(COMPLEX_HTML_RE.test(html))
    onChange(html, divRef.current.innerText)
  }

  const getRange = (): Range => {
    const el = divRef.current!
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      return savedRange.current
    }
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    return r
  }

  const restoreRange = (range: Range) => {
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const execFormat = (cmd: string) => {
    const el = divRef.current
    if (!el) return
    el.focus()
    restoreRange(getRange())
    document.execCommand(cmd, false)
    emit()
  }

  const insertText = (text: string) => {
    const el = divRef.current
    if (!el) return
    el.focus()
    const range = getRange()
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    restoreRange(range)
    savedRange.current = range.cloneRange()
    emit()
  }

  // ── Autocomplete: triggered when user types { in the editor ────────────────

  const checkAutocomplete = () => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !divRef.current?.contains(sel.anchorNode)) {
      setAc(null)
      return
    }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) { setAc(null); return }

    const before = (node.textContent || '').slice(0, range.startOffset)
    // Match a bare { (optionally {{) followed by optional word chars at end.
    const match = before.match(/\{(\{?)(\w*)$/)
    if (!match) { setAc(null); return }

    const query = match[2].toLowerCase()

    // Position the popup below the caret.
    const caretRect = range.getBoundingClientRect()
    const containerRect = containerRef.current!.getBoundingClientRect()
    setAc({
      query,
      top: caretRect.bottom - containerRect.top + 4,
      left: Math.min(caretRect.left - containerRect.left, containerRect.width - 208),
      activeIndex: 0,
    })
  }

  // Delete the `{...query` that the user typed, then insert the replacement.
  const applyAutocomplete = (item: typeof AUTOCOMPLETE_ITEMS[number]) => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !divRef.current?.contains(sel.anchorNode)) return
    const range = sel.getRangeAt(0).cloneRange()
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return

    const before = (node.textContent || '').slice(0, range.startOffset)
    const match = before.match(/\{(\{?\w*)$/)
    if (!match) return

    // Delete the typed fragment (the opening { + any chars).
    range.setStart(node, range.startOffset - match[0].length)
    range.deleteContents()

    const textNode = document.createTextNode(item.insert)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    restoreRange(range)
    savedRange.current = range.cloneRange()
    setAc(null)
    emit()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ac) return
    const filtered = AUTOCOMPLETE_ITEMS.filter(i =>
      i.label.toLowerCase().includes(ac.query) || i.hint.includes(ac.query)
    )
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAc(prev => prev ? { ...prev, activeIndex: Math.min(prev.activeIndex + 1, filtered.length - 1) } : prev)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAc(prev => prev ? { ...prev, activeIndex: Math.max(prev.activeIndex - 1, 0) } : prev)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[ac.activeIndex]) {
        e.preventDefault()
        applyAutocomplete(filtered[ac.activeIndex])
      }
    } else if (e.key === 'Escape') {
      setAc(null)
    }
  }

  const confirmLink = () => {
    const url = linkUrl.trim()
    if (!url) { setLinkMode(false); return }
    const el = divRef.current
    if (!el) return
    el.focus()
    const range = getRange()
    const selectedText = range.toString()
    const anchor = document.createElement('a')
    anchor.href = url.startsWith('http') ? url : `https://${url}`
    anchor.textContent = selectedText || url
    range.deleteContents()
    range.insertNode(anchor)
    range.setStartAfter(anchor)
    range.collapse(true)
    restoreRange(range)
    savedRange.current = range.cloneRange()
    setLinkUrl('')
    setLinkMode(false)
    emit()
  }

  const acFiltered = ac
    ? AUTOCOMPLETE_ITEMS.filter(i =>
        i.label.toLowerCase().includes(ac.query) || i.hint.includes(ac.query)
      )
    : []

  return (
    <div ref={containerRef} className={cn('border rounded-md overflow-hidden bg-background relative', className)}>
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-1 border-b bg-muted/40">
        <ToolbarBtn onMouseDown={e => { e.preventDefault(); execFormat('bold') }} title="Bold">
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn onMouseDown={e => { e.preventDefault(); execFormat('italic') }} title="Italic">
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn onMouseDown={e => { e.preventDefault(); execFormat('underline') }} title="Underline">
          <Underline size={13} />
        </ToolbarBtn>

        {/* Inline link input */}
        <div className="relative">
          <ToolbarBtn
            onMouseDown={e => { e.preventDefault(); setLinkMode(v => !v); setTagsOpen(false) }}
            title="Insert link"
            active={linkMode}
          >
            <LinkIcon size={13} />
          </ToolbarBtn>
          {linkMode && (
            <div
              className="absolute z-30 top-full left-0 mt-1 flex items-center gap-1 rounded-md border bg-popover shadow-md p-1.5 min-w-64"
              onMouseDown={e => e.stopPropagation()}
            >
              <input
                ref={linkInputRef}
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); confirmLink() }
                  if (e.key === 'Escape') setLinkMode(false)
                }}
                placeholder="https://example.com"
                className="flex-1 bg-transparent text-xs outline-none px-1"
              />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={confirmLink} className="p-1 rounded hover:bg-muted text-green-600">
                <Check size={13} />
              </button>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setLinkMode(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        <span className="w-px h-4 bg-border mx-1" />

        {/* Merge tags dropdown — scrollable */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setTagsOpen(v => !v); setLinkMode(false) }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-xs font-medium"
            title="Insert personalization tag"
          >
            <span className="font-mono">{'{{ }}'}</span>
            <ChevronDown size={11} />
          </button>
          {tagsOpen && (
            <div
              className="absolute z-30 top-full left-0 mt-1 w-56 rounded-md border bg-popover shadow-md py-1 max-h-72 overflow-y-auto"
              onMouseDown={e => e.stopPropagation()}
            >
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
              {CONTACT_TAGS.map(t => (
                <button key={t.tag} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { insertText(`{{${t.tag}}}`); setTagsOpen(false) }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <span>{t.label}</span>
                  <span className="font-mono text-muted-foreground text-[10px]">{`{{${t.tag}}}`}</span>
                </button>
              ))}
              <div className="border-t my-1" />
              <p className="px-3 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sender (you)</p>
              {SENDER_TAGS.map(t => (
                <button key={t.tag} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { insertText(`{{${t.tag}}}`); setTagsOpen(false) }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <span>{t.label}</span>
                  <span className="font-mono text-muted-foreground text-[10px]">{`{{${t.tag}}}`}</span>
                </button>
              ))}
              <div className="border-t my-1" />
              <p className="px-3 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Spintax</p>
              <button type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { insertText('{Option A|Option B}'); setTagsOpen(false) }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
              >
                <span>Random variation</span>
                <span className="font-mono text-muted-foreground text-[10px]">{'{a|b|c}'}</span>
              </button>
            </div>
          )}
        </div>

        <ToolbarBtn
          onMouseDown={e => { e.preventDefault(); insertText('{Hi|Hey|Hello}') }}
          title="Insert spintax — one option picked at random per send"
        >
          <Shuffle size={13} />
        </ToolbarBtn>
      </div>

      {/* Deliverability warning */}
      {complexHtml && (
        <div className="mx-2 my-2 flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
            <AlertTriangle size={11} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Deliverability risk</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Heavy HTML (images, tables, styles) causes cold emails to land in <span className="font-semibold">Spam or Promotions</span>. Stick to plain text with simple formatting.
            </p>
          </div>
        </div>
      )}

      {/* Editable area */}
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => { emit(); checkAutocomplete() }}
        onKeyDown={handleKeyDown}
        className="px-3 py-2 text-sm min-h-56 max-h-96 overflow-y-auto outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
      />

      {/* Inline { } autocomplete popup */}
      {ac && acFiltered.length > 0 && (
        <div
          ref={acRef}
          className="absolute z-40 w-52 rounded-md border bg-popover shadow-lg py-1 max-h-52 overflow-y-auto"
          style={{ top: ac.top, left: ac.left }}
          onMouseDown={e => e.preventDefault()}
        >
          <p className="px-3 py-1 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
            Insert tag
          </p>
          {acFiltered.map((item, i) => (
            <button
              key={item.insert}
              type="button"
              onClick={() => applyAutocomplete(item)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-1.5 text-xs',
                i === ac.activeIndex ? 'bg-muted' : 'hover:bg-muted'
              )}
            >
              <span>{item.label}</span>
              <span className="font-mono text-muted-foreground text-[10px]">{item.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({ onMouseDown, title, children, active }: {
  onMouseDown: (e: React.MouseEvent) => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      title={title}
      className={cn('p-1.5 rounded hover:bg-muted', active && 'bg-muted text-primary')}
    >
      {children}
    </button>
  )
}
