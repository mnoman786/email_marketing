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
    draft: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
    scheduled: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
    sending: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
    sent: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
    failed: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
    paused: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
    cancelled: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
    active: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
    unsubscribed: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
    bounced: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
    pending: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
  }
  return map[status] || 'text-gray-500 bg-gray-100'
}
