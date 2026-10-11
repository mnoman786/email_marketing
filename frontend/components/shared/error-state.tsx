import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

/**
 * Companion to EmptyState for the failure case. Most list queries only handled
 * loading + empty, so a network/500 error showed nothing — this makes the
 * failure visible and recoverable.
 */
export function ErrorState({
  title = 'Couldn’t load this',
  description = 'Something went wrong fetching the data. Check your connection and try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-18 px-5 text-center">
      <div className="flex items-center justify-center w-18 h-18 rounded-[1.5rem] border border-destructive/15 bg-destructive/10 mb-5">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>
      <h3 className="text-xl font-bold mb-1">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground max-w-sm mb-6">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </Button>
      )}
    </div>
  )
}
