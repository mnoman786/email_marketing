'use client'
import { useTheme } from 'next-themes'
import { Moon, Sun, Bell, Search, ChevronDown, LogOut, User as UserIcon, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/auth-provider'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface TopbarProps {
  title?: string
}

export function Topbar({ title }: TopbarProps) {
  const { theme, setTheme } = useTheme()
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
    <header className="flex items-center justify-between h-16 px-6 border-b bg-card/50 backdrop-blur shrink-0">
      {title && <h1 className="text-lg font-semibold">{title}</h1>}

      <div className="flex items-center gap-3 ml-auto">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-muted-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </Button>

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
                    <UserIcon size={14} />
                    Profile
                  </div>
                </Link>
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
