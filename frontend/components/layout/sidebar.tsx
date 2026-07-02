'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { inboxApi } from '@/lib/api'
import {
  LayoutDashboard, Users, Server, Megaphone, BarChart3, Settings,
  ChevronLeft, ChevronRight, Zap, ListFilter, Inbox, Bell, BellOff, ShieldBan, Search
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/lists', label: 'Lists', icon: ListFilter },
  { href: '/leads', label: 'Lead Finder', icon: Search },
  { href: '/suppressions', label: 'Suppression', icon: ShieldBan },
  { href: '/smtp', label: 'SMTP Accounts', icon: Server },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

const bottomItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const { data: unreadData } = useQuery({
    queryKey: ['inbox-unread-count'],
    queryFn: () => inboxApi.unreadCount().then(r => r.data as { count: number }),
    refetchInterval: 30000,
  })
  const unreadCount = unreadData?.count || 0

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : null)
  )
  const prevUnreadRef = useRef<number | null>(null)

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

  return (
    <aside
      className={cn(
        'relative flex flex-col h-screen border-r bg-card transition-all duration-300 shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 border-b px-4', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary shadow-sm shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight">MailFlow</span>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <div
              className={cn(
                'sidebar-item',
                isActive(href) && 'active',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
              {!collapsed && <span className="flex-1">{label}</span>}
              {href === '/inbox' && unreadCount > 0 && (
                <span className={cn(
                  'flex items-center justify-center text-[10px] font-semibold rounded-full bg-primary text-primary-foreground',
                  collapsed ? 'absolute top-1 right-1 w-2 h-2' : 'min-w-4.5 h-4.5 px-1'
                )}>
                  {!collapsed && (unreadCount > 99 ? '99+' : unreadCount)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="py-4 px-2 border-t space-y-1">
        {notifPermission && notifPermission !== 'granted' && (
          <button
            onClick={requestNotifPermission}
            className={cn('sidebar-item w-full', collapsed && 'justify-center px-0')}
            title={collapsed ? 'Enable reply notifications' : undefined}
          >
            {notifPermission === 'denied' ? <BellOff size={18} className="shrink-0" /> : <Bell size={18} className="shrink-0" />}
            {!collapsed && <span>{notifPermission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}</span>}
          </button>
        )}
        {bottomItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <div
              className={cn(
                'sidebar-item',
                isActive(href) && 'active',
                collapsed && 'justify-center px-0'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 rounded-full border bg-card shadow-sm hover:bg-accent transition-colors z-10"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
