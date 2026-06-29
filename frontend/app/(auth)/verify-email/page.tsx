'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Zap, CheckCircle2, XCircle, Loader2, MailCheck } from 'lucide-react'
import toast from 'react-hot-toast'

type Status = 'verifying' | 'success' | 'error' | 'missing'

function VerifyEmailInner() {
  const params = useSearchParams()
  const token = params.get('token')
  const email = params.get('email') || ''
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'missing')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'This verification link is invalid or has expired.')
      })
  }, [token])

  const resend = async () => {
    if (!email) {
      toast.error('Enter your email on the sign-in page to resend the link.')
      return
    }
    setResending(true)
    try {
      const res = await authApi.resendVerification(email)
      toast.success(res.data?.detail || 'Verification email sent — check your inbox.')
    } catch {
      toast.error('Could not send the email. Please try again later.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-muted/30">
      <div className="w-full max-w-md bg-card border rounded-2xl p-8 shadow-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-sm">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl">MailFlow</span>
        </div>

        {status === 'verifying' && (
          <>
            <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
            <h1 className="text-xl font-bold mb-1">Verifying your email…</h1>
            <p className="text-muted-foreground text-sm">This will only take a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">Email verified!</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Your email address has been confirmed. You can now sign in.
            </p>
            <Button asChild className="w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">Verification failed</h1>
            <p className="text-muted-foreground text-sm mb-6">{message}</p>
            {email && (
              <Button className="w-full" onClick={resend} loading={resending}>
                Resend verification email
              </Button>
            )}
            <p className="text-center text-sm text-muted-foreground mt-4">
              <Link href="/login" className="text-primary font-medium hover:underline">Back to sign in</Link>
            </p>
          </>
        )}

        {status === 'missing' && (
          <>
            <MailCheck className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-1">Check your inbox</h1>
            <p className="text-muted-foreground text-sm mb-6">
              We've sent a verification link{email ? <> to <span className="font-medium text-foreground">{email}</span></> : ''}.
              Open it to confirm your account, then sign in.
            </p>
            <Button className="w-full" onClick={resend} loading={resending}>
              Resend verification email
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-4">
              <Link href="/login" className="text-primary font-medium hover:underline">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  )
}
