import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TabItem<K extends string = string> {
  key: K
  label: string
  icon?: React.ComponentType<{ size?: number }>
  badge?: number
  /** Small dot next to the label — used to flag incomplete/invalid tabs. */
  dotClassName?: string
}

interface TabsProps<K extends string> {
  tabs: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
}

/** Underlined tab bar shared across campaign pages — dumb/controlled, no internal state. */
export function Tabs<K extends string>({ tabs, value, onChange, className }: TabsProps<K>) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {tabs.map(t => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              'relative flex items-center gap-2 px-3 py-3.5 text-sm font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.icon && <t.icon size={14} />}
            {t.label}
            {t.badge !== undefined && (
              <span className={cn(
                'text-[10px] font-semibold rounded-full w-4.5 h-4.5 flex items-center justify-center',
                active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>{t.badge}</span>
            )}
            {t.dotClassName && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', t.dotClassName)} />}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}
