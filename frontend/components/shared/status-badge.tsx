import { getStatusColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusLabels: Record<string, string> = {
  draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending',
  sent: 'Sent', failed: 'Failed', paused: 'Paused', cancelled: 'Cancelled',
  active: 'Active', unsubscribed: 'Unsubscribed', bounced: 'Bounced',
  complained: 'Complained', pending: 'Pending', opened: 'Opened',
  clicked: 'Clicked',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn('badge', getStatusColor(status), className)}>
      {statusLabels[status] || status}
    </span>
  )
}
