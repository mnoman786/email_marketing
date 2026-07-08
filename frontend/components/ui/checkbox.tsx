'use client'
import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Renders the native tri-state dash — use for "some but not all rows selected". */
  indeterminate?: boolean
}

/**
 * Styled checkbox that supports the indeterminate state (which plain JSX can't
 * set — it's a DOM property, not an attribute). Colours itself with the app
 * primary via `accent-*` so it matches the indigo accent in both themes.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, ...props }, ref) => {
    const innerRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = !!indeterminate
    }, [indeterminate])

    return (
      <input
        type="checkbox"
        ref={(node) => {
          innerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
        }}
        className={cn(
          'h-4 w-4 shrink-0 rounded-[5px] border border-input bg-background',
          'accent-[hsl(var(--primary))] cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className
        )}
        {...props}
      />
    )
  }
)
Checkbox.displayName = 'Checkbox'
