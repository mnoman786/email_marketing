'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { restoreAuthFromOtherTab, setTokens, setUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Zap, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    restoreAuthFromOtherTab().then(authenticated => {
      if (active && authenticated) router.replace('/dashboard')
    })
    return () => { active = false }
  }, [router])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await authApi.login(data)
      setTokens(res.data.access, res.data.refresh)
      setUser(res.data.user)
      router.push('/dashboard')
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error('Please verify your email before signing in.')
        router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
        return
      }
      toast.error(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#f7f6fc] dark:bg-background">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md rounded-[1.75rem] border border-white/90 bg-white/90 p-7 sm:p-10 shadow-[0_25px_70px_-40px_rgba(42,29,114,0.35)] dark:border-border dark:bg-card">
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-sm">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">MailFlow</span>
          </div>

          <h1 className="text-3xl font-bold mb-1">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to your MailFlow workspace</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('email')} type="email" placeholder="you@company.com" className="pl-9" />
              </div>
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('password')} type="password" placeholder="••••••••" className="pl-9" />
              </div>
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Right: branding */}
      <div className="relative hidden lg:flex flex-1 overflow-hidden bg-[#171239] items-center justify-center p-12">
        <div className="absolute -top-40 -right-40 h-160 w-160 rounded-full bg-violet-600/35 blur-3xl" />
        <div className="absolute -bottom-48 -left-40 h-140 w-140 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative text-white max-w-lg">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[.15em] text-violet-200"><Zap size={14} /> Outreach, organized</div>
          <h2 className="text-5xl leading-[1.12] font-bold mb-5">
            Better outreach.<br /><span className="text-violet-300">Real connections.</span>
          </h2>
          <p className="text-violet-100/75 leading-relaxed">
            MailFlow gives you powerful tools to manage contacts, run multi-step drip campaigns, and deliver emails that actually land in the inbox.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { label: 'Sequences', desc: 'Multi-step drip campaigns' },
              { label: 'Analytics', desc: 'Real-time delivery tracking' },
              { label: 'Inbox', desc: 'Manage replies in one place' },
              { label: 'Contacts', desc: 'Lists and bulk import' },
            ].map(f => (
              <div key={f.label} className="border border-white/10 bg-white/8 backdrop-blur rounded-2xl p-4">
                <p className="font-semibold text-sm">{f.label}</p>
                <p className="text-blue-100 text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
