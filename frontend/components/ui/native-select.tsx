'use client'
import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Styled wrapper over a native <select> — keeps native keyboard/mobile
 * behaviour but gives it the same height, border, and a proper chevron so it
 * matches Input and the rest of the toolbar. Drop-in for raw <select>.
 */
interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Class for the wrapper — pass `w-full` to stretch the control full width. */
  wrapperClassName?: string
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn('relative inline-flex', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm shadow-sm',
          'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
)
NativeSelect.displayName = 'NativeSelect'
