'use client'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi, authApi } from '@/lib/api'
import { DashboardStats, UserSession } from '@/lib/types'
import { StatCard } from '@/components/shared/stat-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { CardSkeleton } from '@/components/shared/loading-skeleton'
import { formatNumber, formatPercent, formatDateTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts'
import { Users, Megaphone, Mail, Server, TrendingUp, Laptop } from 'lucide-react'
import Link from 'next/link'

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280']

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => analyticsApi.dashboard().then(r => r.data as DashboardStats),
    refetchInterval: 30000,
  })

  const { data: sessions } = useQuery({
    queryKey: ['active-sessions'],
    queryFn: () => authApi.sessions().then(r => r.data as UserSession[]),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  if (!data) return null

  const statusData = data.campaigns.statuses.map(s => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
  }))

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of your email marketing performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Leads"
          value={formatNumber(data.contacts.total)}
          subtitle={`${formatNumber(data.contacts.active)} active`}
          icon={Users}
          gradient="blue"
        />
        <StatCard
          title="Campaigns"
          value={formatNumber(data.campaigns.total)}
          subtitle={`${data.campaigns.active} active`}
          icon={Megaphone}
          gradient="purple"
        />
        <StatCard
          title="Emails Sent"
          value={formatNumber(data.emails.total_sent)}
          subtitle={`${formatPercent(data.emails.delivery_rate)} delivery rate`}
          icon={Mail}
          gradient="green"
        />
        <StatCard
          title="SMTP Accounts"
          value={data.smtp_accounts}
          subtitle="Active & configured"
          icon={Server}
          gradient="orange"
        />
      </div>

      {/* Email metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { label: 'Open Rate', value: formatPercent(data.emails.open_rate), sub: `${formatNumber(data.emails.total_opened)} opens`, color: 'text-blue-600' },
          { label: 'Delivery Rate', value: formatPercent(data.emails.delivery_rate), sub: `${formatNumber(data.emails.total_sent)} delivered`, color: 'text-green-600' },
          { label: 'Failed (30d)', value: formatNumber(data.emails.recent_failed_30d), sub: 'last 30 days', color: 'text-red-600' },
        ].map(m => (
          <Card key={m.label} className="card-hover">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className={`text-3xl font-bold mt-1 ${m.color}`}>{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
            </CardContent>
          </Card>
        ))}
        <Link href="/settings">
          <Card className="card-hover cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Connected Devices</p>
                <Laptop size={15} className="text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold mt-1 text-purple-600">{sessions ? sessions.length : '—'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">active sessions</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Send trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={16} />
              Email Activity (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="sent" stroke="#3b82f6" fill="url(#sentGrad)" strokeWidth={2} name="Sent" />
                <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="url(#failGrad)" strokeWidth={2} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Campaign status pie */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No campaigns yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SMTP Performance */}
      {data.smtp_performance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>SMTP Account Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.smtp_performance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="sent" fill="#3b82f6" name="Sent" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/campaigns', label: 'Create Campaign', desc: 'Launch a new email campaign', icon: Megaphone, color: 'from-blue-500 to-blue-600' },
          { href: '/leads', label: 'Import Leads', desc: 'Add leads to your lists', icon: Users, color: 'from-green-500 to-green-600' },
          { href: '/templates', label: 'New Template', desc: 'Design a reusable template', icon: Mail, color: 'from-purple-500 to-purple-600' },
        ].map(a => (
          <Link key={a.href} href={a.href}>
            <Card className="card-hover cursor-pointer overflow-hidden">
              <CardContent className="p-0">
                <div className={`h-1.5 bg-gradient-to-r ${a.color}`} />
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <a.icon size={18} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
