import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Composable table primitives shared by every listing page. They carry the
 * "premium" styling decisions in one place — refined header typography, a
 * hairline row divider, hover, and a left accent on the selected row — so the
 * pages themselves stay declarative and every table looks identical.
 */

export function TableContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', className)}
      {...props}
    />
  )
}

/** Horizontal-scroll wrapper. Tables must never widen the page body. */
export function TableScroll({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-x-auto', className)} {...props} />
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-sm border-collapse', className)} {...props} />
}

export function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/40', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function TableHeaderRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border', className)} {...props} />
}

/** Column heading — small, upper, tracked, echoing the sidebar group labels. */
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-11 px-4 text-left align-middle whitespace-nowrap',
        'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

interface TRProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean
}

export function TR({ className, selected, ...props }: TRProps) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        'border-b border-border/60 transition-colors last:border-0',
        selected
          ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_0_hsl(var(--primary))] hover:bg-primary/[0.09]'
          : 'hover:bg-muted/40',
        className
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />
}
