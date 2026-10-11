'use client'
import { useTheme } from '@/components/providers/theme-provider'
import { Moon, Sun, ChevronDown, LogOut, Settings, Menu, Plus, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface TopbarProps {
  title?: string
  onMenuClick?: () => void
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const section = title || ({ dashboard: 'Overview', unibox: 'Inbox', leads: 'Leads', lists: 'Lists', tags: 'Tags', campaigns: 'Campaigns', workflows: 'Workflows', analytics: 'Analytics', accounts: 'Accounts', settings: 'Settings', validation: 'Email Validation', blocklist: 'Blocklist', 'lead-finder': 'Lead Finder' } as Record<string, string>)[pathname.split('/')[1]] || 'Workspace'
  const { resolvedTheme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initials = user
    ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || user.email[0].toUpperCase()
    : '?'

  return (
    <header className="app-topbar flex items-center justify-between min-h-19 px-4 sm:px-7 border-b border-white/10 bg-[#17142f] text-white shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open navigation"><Menu size={20} /></Button>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">MailFlow / Workspace</p>
          <p className="text-base font-bold tracking-tight truncate">{section}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex"><Link href="/campaigns/new"><Plus size={15} /> New campaign</Link></Button>
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="text-muted-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" className="text-muted-foreground" asChild><Link href="/unibox" aria-label="Open inbox"><Inbox className="h-4 w-4" /></Link></Button>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-none">
                {user?.first_name || user?.email?.split('@')[0]}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user?.company_name || user?.email}
              </p>
            </div>
            <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border bg-popover shadow-lg z-50 overflow-hidden">
              <div className="p-2 border-b">
                <p className="text-sm font-medium px-2">{user?.email}</p>
                {user?.company_name && (
                  <p className="text-xs text-muted-foreground px-2">{user.company_name}</p>
                )}
              </div>
              <div className="p-1">
                <Link href="/settings" onClick={() => setDropdownOpen(false)}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent cursor-pointer">
                    <Settings size={14} />
                    Settings
                  </div>
                </Link>
                <div className="border-t my-1" />
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent w-full text-left text-red-600 dark:text-red-400"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
