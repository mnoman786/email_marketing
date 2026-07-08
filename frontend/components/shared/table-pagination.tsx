'use client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

/** Builds a compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(current: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(last - 1, current + 1)
  if (start > 2) out.push('…')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < last - 1) out.push('…')
  out.push(last)
  return out
}

export function TablePagination({ page, pageSize, total, onPageChange, className }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className={cn('flex items-center justify-between gap-3 border-t px-4 py-3 flex-wrap', className)}>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{from.toLocaleString()}–{to.toLocaleString()}</span>{' '}
        of <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </Button>

        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1.5 text-xs text-muted-foreground select-none">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className="text-xs tabular-nums"
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  )
}
