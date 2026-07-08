'use client'
import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { Input } from './input'
import { cn } from '@/lib/utils'

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Class for the wrapper (e.g. `flex-1 min-w-48`, `max-w-sm`). */
  wrapperClassName?: string
}

/**
 * Search field with the leading magnifier — the exact pattern that was
 * hand-rolled on every listing page. One component now, so the icon position
 * and padding are identical everywhere.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ wrapperClassName, className, ...props }, ref) => (
    <div className={cn('relative', wrapperClassName)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input ref={ref} className={cn('pl-9', className)} {...props} />
    </div>
  )
)
SearchInput.displayName = 'SearchInput'
