'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { inboxApi } from '@/lib/api'
import {
  LayoutDashboard, Users, Server, Megaphone, BarChart3,
  ChevronLeft, ChevronRight, Zap, ListFilter, Inbox, Bell, BellOff, ShieldBan, Search, ShieldCheck, Workflow, Tags
} from 'lucide-react'
import { startTransition, useEffect, useRef, useState } from 'react'

const topItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
]

// Grouped so the rail reads as sections, not a flat wall of links — Inbox
// first since replies are the most time-sensitive thing to check, then
// contact sourcing/cleanup, outbound sending, sending infrastructure.
// Settings lives in the profile menu (Topbar), not here.
const navGroups = [
  {
    label: 'Inbox',
    items: [
      { href: '/unibox', label: 'Unibox', icon: Inbox },
    ],
  },
  {
    label: 'Contacts',
    items: [
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/lists', label: 'Lists', icon: ListFilter },
      { href: '/tags', label: 'Tags', icon: Tags },
      { href: '/lead-finder', label: 'Lead Finder', icon: Search },
      { href: '/validation', label: 'Email Validation', icon: ShieldCheck },
    ],
  },
  {
    label: 'Outbound',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/workflows', label: 'Workflows', icon: Workflow },
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Server },
      { href: '/blocklist', label: 'Blocklist', icon: ShieldBan },
    ],
  },
]

export function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const { data: unreadData } = useQuery({
    queryKey: ['inbox-unread-count'],
    queryFn: () => inboxApi.unreadCount().then(r => r.data as { count: number }),
    refetchInterval: 30000,
  })
  const unreadCount = unreadData?.count || 0

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null)
  const prevUnreadRef = useRef<number | null>(null)

  useEffect(() => {
    if ('Notification' in window) {
      startTransition(() => setNotifPermission(Notification.permission))
    }
  }, [])

  // Fire a desktop notification whenever unread count rises — covers replies
  // landing while the user is on any page, not just the inbox.
  useEffect(() => {
    if (unreadData === undefined) return
    const count = unreadData.count
    if (
      prevUnreadRef.current !== null && count > prevUnreadRef.current &&
      typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
    ) {
      const diff = count - prevUnreadRef.current
      new Notification('New inbox reply', { body: `You have ${diff} new repl${diff > 1 ? 'ies' : 'y'} waiting.` })
    }
    prevUnreadRef.current = count
  }, [unreadData])

  const requestNotifPermission = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    Notification.requestPermission().then(setNotifPermission)
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const renderItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) => (
    <Link key={href} href={href} onClick={onNavigate}>
      <div
        className={cn(
          'sidebar-item',
          isActive(href) && 'active',
          collapsed && !mobile && 'justify-center px-0'
        )}
        title={collapsed && !mobile ? label : undefined}
      >
        <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
        {(!collapsed || mobile) && <span className="flex-1">{label}</span>}
        {href === '/unibox' && unreadCount > 0 && (
          <span className={cn(
            'flex items-center justify-center text-[10px] font-semibold rounded-full bg-primary text-primary-foreground',
            collapsed && !mobile ? 'absolute top-1 right-1 w-2 h-2' : 'min-w-4.5 h-4.5 px-1'
          )}>
            {(!collapsed || mobile) && (unreadCount > 99 ? '99+' : unreadCount)}
          </span>
        )}
      </div>
    </Link>
  )

  return (
    <aside
      className={cn(
        'sidebar-rail relative flex flex-col h-screen transition-all duration-300 shrink-0',
        mobile ? 'w-70' : collapsed ? 'w-18' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn('sidebar-border flex items-center h-19 border-b px-5', collapsed && !mobile ? 'justify-center' : 'gap-3')}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary shadow-[0_8px_20px_-5px_rgba(124,93,255,0.8)] shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        {(!collapsed || mobile) && (
          <span className="text-xl font-bold tracking-tight">Mail<span className="text-violet-300">Flow</span></span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1">
        {topItems.map(renderItem)}
        {navGroups.map(group => (
          <div key={group.label}>
            {(!collapsed || mobile) && <div className="sidebar-group-label">{group.label}</div>}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Bottom nav */}
      {notifPermission && notifPermission !== 'granted' && (
        <div className="sidebar-border py-4 px-2 border-t">
          <button
            onClick={requestNotifPermission}
            className={cn('sidebar-item w-full', collapsed && 'justify-center px-0')}
            title={collapsed ? 'Enable reply notifications' : undefined}
          >
            {notifPermission === 'denied' ? <BellOff size={18} className="shrink-0" /> : <Bell size={18} className="shrink-0" />}
            {!collapsed && <span>{notifPermission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}</span>}
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      {!mobile && <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 flex items-center justify-center w-6 h-6 rounded-full border bg-card text-foreground shadow-sm hover:bg-accent transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>}
    </aside>
  )
}
