'use client'
import { createContext, startTransition, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Lightweight replacement for next-themes. next-themes injects its anti-flash
 * <script> from a *client* component, which React 19 flags with "Encountered a
 * script tag while rendering React component" — and it exposes no way to turn
 * that off. This provider owns the theme state and applies it after mounting,
 * so no React component needs to render a script element.
 *
 * Behaviour mirrors the old config: attribute="class", defaultTheme="system",
 * enableSystem, and the same localStorage key ('theme') so existing prefs carry
 * over.
 */

export type Theme = 'light' | 'dark' | 'system'
export const THEME_STORAGE_KEY = 'theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Apply a theme to <html> and return what it resolved to. */
function applyTheme(theme: Theme): 'light' | 'dark' {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  return dark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR/first render assume the config default; the stored value is read on mount.
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    let stored: Theme = 'system'
    try {
      stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system'
    } catch {}
    startTransition(() => {
      setThemeState(stored)
      setResolvedTheme(applyTheme(stored))
    })
  }, [])

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (theme === 'system') setResolvedTheme(applyTheme('system')) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    setResolvedTheme(applyTheme(next))
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch {}
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Safe fallback if used outside the provider (matches next-themes' leniency).
    return { theme: 'system', resolvedTheme: 'light', setTheme: () => {} }
  }
  return ctx
}
