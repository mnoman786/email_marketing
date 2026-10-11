import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div className="empty-spotlight flex flex-col items-center justify-center min-h-[340px] py-16 px-5 text-center">
      <span className="mb-5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-primary">Ready when you are</span>
      <div className="flex items-center justify-center w-19 h-19 rounded-[1.5rem] border border-primary/20 bg-card shadow-[0_18px_40px_-18px_rgba(100,70,220,0.6)] mb-5">
        <Icon className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-2xl font-bold mb-1">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground max-w-sm mb-6">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {action && <Button onClick={action.onClick}>{action.label}</Button>}
        {secondaryAction && <Button variant="outline" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>}
      </div>
    </div>
  )
}
