import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MailFlow — Email Marketing Platform',
  description: 'Premium SaaS Email Marketing Platform',
}

// Sets the theme class before hydration so there's no flash of the wrong
// theme. Mirrors ThemeProvider's logic and storage key ('theme'). Uses
// next/script with strategy="beforeInteractive" — the documented way to run
// an inline script from the root layout ahead of hydration — instead of a
// raw <script> tag, which React 19 flags as "script tag inside a component"
// since a plain <script> rendered by a component never actually executes.
const themeInitScript = `(function(){try{var e=localStorage.getItem('theme')||'system';var d=e==='dark'||(e==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement;if(d)c.classList.add('dark');else c.classList.remove('dark');c.style.colorScheme=d?'dark':'light';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <ThemeProvider>
          <QueryProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  borderRadius: '8px',
                  background: 'var(--toast-bg)',
                  color: 'var(--toast-color)',
                  border: '1px solid var(--toast-border)',
                },
                success: { duration: 3000 },
                error: { duration: 5000 },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
