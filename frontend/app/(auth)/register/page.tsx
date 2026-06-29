'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Zap, Mail, Lock, User, Building2, AtSign, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

const schema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3, 'At least 3 characters'),
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  company_name: z.string().optional(),
  password: z.string().min(8, 'At least 8 characters'),
  password_confirm: z.string(),
}).refine(d => d.password === d.password_confirm, {
  message: 'Passwords must match',
  path: ['password_confirm'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await authApi.register(data)
      toast.success('Account created! Check your inbox to verify your email.')
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
    } catch (err: any) {
      const errors = err.response?.data
      const msg = errors?.email?.[0] || errors?.username?.[0] || errors?.detail || 'Registration failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-sm">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">MailFlow</span>
          </div>

          <h1 className="text-2xl font-bold mb-1">Create your account</h1>
          <p className="text-muted-foreground text-sm mb-8">Start sending campaigns in minutes</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input {...register('first_name')} placeholder="John" className="pl-9" />
                </div>
                {errors.first_name && <p className="text-xs text-destructive mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <Label>Last Name</Label>
                <Input {...register('last_name')} placeholder="Doe" className="mt-1" />
                {errors.last_name && <p className="text-xs text-destructive mt-1">{errors.last_name.message}</p>}
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('email')} type="email" placeholder="you@company.com" className="pl-9" />
              </div>
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label>Username</Label>
              <div className="relative mt-1">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('username')} placeholder="johndoe" className="pl-9" />
              </div>
              {errors.username && <p className="text-xs text-destructive mt-1">{errors.username.message}</p>}
            </div>
            <div>
              <Label>Company Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('company_name')} placeholder="Acme Inc." className="pl-9" />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('password')} type="password" placeholder="Min. 8 characters" className="pl-9" />
              </div>
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <Label>Confirm Password</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <Input {...register('password_confirm')} type="password" placeholder="••••••••" className="pl-9" />
              </div>
              {errors.password_confirm && <p className="text-xs text-destructive mt-1">{errors.password_confirm.message}</p>}
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Right: branding */}
      <div className="hidden lg:flex flex-1 bg-linear-to-br from-blue-600 to-indigo-700 items-center justify-center p-12">
        <div className="text-white max-w-sm">
          <h2 className="text-3xl font-bold mb-4">
            Everything you need to grow
          </h2>
          <p className="text-blue-100 leading-relaxed mb-8">
            Join MailFlow and start delivering campaigns that land in the inbox — with the tools to manage every contact, template, and send.
          </p>
          <ul className="space-y-3">
            {[
              'Smart SMTP routing with load balancing',
              'Real-time delivery & open analytics',
              'Drag-and-drop HTML template editor',
              'Unlimited contacts, lists & bulk import',
            ].map(item => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-200 shrink-0" />
                <span className="text-sm text-blue-50">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
