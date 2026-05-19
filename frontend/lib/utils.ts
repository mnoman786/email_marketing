import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft:        'badge-gray',
    scheduled:    'badge-blue',
    sending:      'badge-amber',
    sent:         'badge-green',
    failed:       'badge-red',
    paused:       'badge-orange',
    cancelled:    'badge-gray',
    active:       'badge-green',
    unsubscribed: 'badge-orange',
    bounced:      'badge-red',
    pending:      'badge-gray',
    opened:       'badge-purple',
    clicked:      'badge-blue',
    complained:   'badge-red',
  }
  return map[status] || 'badge-gray'
}
