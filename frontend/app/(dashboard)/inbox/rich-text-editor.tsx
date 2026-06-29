'use client'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Bold, Italic, Underline, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RichTextEditorHandle {
  insertHTML: (html: string) => void
  clear: () => void
  focus: () => void
}

interface Props {
  onChange: (html: string, text: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

// Uncontrolled by design: contentEditable + React state fight each other on every
// keystroke (cursor jumps to the end). We read the DOM on input/imperative calls instead.
export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { onChange, placeholder, className, onKeyDown },
  ref
) {
  const divRef = useRef<HTMLDivElement>(null)

  const emit = () => {
    if (divRef.current) onChange(divRef.current.innerHTML, divRef.current.innerText)
  }

  useImperativeHandle(ref, () => ({
    insertHTML(html: string) {
      if (!divRef.current) return
      divRef.current.focus()
      const ok = document.execCommand('insertHTML', false, html)
      if (!ok) divRef.current.innerHTML += html
      emit()
    },
    clear() {
      if (divRef.current) divRef.current.innerHTML = ''
      emit()
    },
    focus() {
      divRef.current?.focus()
    },
  }))

  const exec = (cmd: string, arg?: string) => {
    divRef.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  return (
    <div className={cn('border rounded-xl overflow-hidden bg-background', className)}>
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/40">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} className="p-1.5 rounded hover:bg-muted" title="Bold">
          <Bold size={13} />
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} className="p-1.5 rounded hover:bg-muted" title="Italic">
          <Italic size={13} />
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} className="p-1.5 rounded hover:bg-muted" title="Underline">
          <Underline size={13} />
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const url = window.prompt('Link URL (https://...)')
            if (url) exec('createLink', url)
          }}
          className="p-1.5 rounded hover:bg-muted"
          title="Insert link"
        >
          <LinkIcon size={13} />
        </button>
      </div>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onKeyDown={onKeyDown}
        className="px-3 py-2 text-sm h-20 overflow-y-auto outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground"
      />
    </div>
  )
})
