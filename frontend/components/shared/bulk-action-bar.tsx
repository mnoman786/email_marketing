'use client'
import { X } from 'lucide-react'

interface Props {
  count: number
  onClear: () => void
  children: React.ReactNode
  /** Noun for the selected items, e.g. "lead". Pluralised automatically. */
  noun?: string
}

/**
 * Floating action bar that rises from the bottom when rows are selected. Keeps
 * bulk actions reachable no matter how far the user has scrolled, instead of
 * hiding them in the filter row.
 */
export function BulkActionBar({ count, onClear, children, noun = 'item' }: Props) {
  if (count <= 0) return null

  return (
    <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-popover/95 py-2 pl-4 pr-2 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center gap-2">
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {count}
          </span>
          <span className="text-sm text-muted-foreground">
            {noun}{count === 1 ? '' : 's'} selected
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5">{children}</div>
        <button
          onClick={onClear}
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Clear selection"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
