import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  gradient: 'blue' | 'green' | 'purple' | 'orange'
  trend?: { value: number; label: string }
  className?: string
}

const gradientMap = {
  blue: 'stat-gradient-blue',
  green: 'stat-gradient-green',
  purple: 'stat-gradient-purple',
  orange: 'stat-gradient-orange',
}

export function StatCard({ title, value, subtitle, icon: Icon, gradient, trend, className }: StatCardProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-[0_16px_32px_-20px_rgba(38,27,108,0.8)]', gradientMap[gradient], className)}>
      <div className="absolute -right-8 -bottom-15 h-34 w-34 rounded-full border border-white/20 bg-white/10" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="text-3xl font-bold mt-1 font-mono tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/20">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs text-white/80">
          <span className={trend.value >= 0 ? 'text-green-200' : 'text-red-200'}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span>{trend.label}</span>
        </div>
      )}
    </div>
  )
}
