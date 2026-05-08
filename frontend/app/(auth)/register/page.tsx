'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { setTokens, setUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Zap } from 'lucide-react'
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
      const res = await authApi.register(data)
      setTokens(res.data.access, res.data.refresh)
      setUser(res.data.user)
      toast.success('Account created!')
      router.push('/dashboard')
    } catch (err: any) {
      const errors = err.response?.data
      const msg = errors?.email?.[0] || errors?.username?.[0] || errors?.detail || 'Registration failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-muted/30">
      <div className="w-full max-w-md bg-card border rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary shadow-sm">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl">MailFlow</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-muted-foreground text-sm mb-6">Start sending campaigns in minutes</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name *</Label>
              <Input {...register('first_name')} placeholder="John" className="mt-1" />
              {errors.first_name && <p className="text-xs text-destructive mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input {...register('last_name')} placeholder="Doe" className="mt-1" />
              {errors.last_name && <p className="text-xs text-destructive mt-1">{errors.last_name.message}</p>}
            </div>
          </div>
          <div>
            <Label>Email *</Label>
            <Input {...register('email')} type="email" placeholder="john@company.com" className="mt-1" />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Label>Username *</Label>
            <Input {...register('username')} placeholder="johndoe" className="mt-1" />
            {errors.username && <p className="text-xs text-destructive mt-1">{errors.username.message}</p>}
          </div>
          <div>
            <Label>Company Name</Label>
            <Input {...register('company_name')} placeholder="Acme Inc." className="mt-1" />
          </div>
          <div>
            <Label>Password *</Label>
            <Input {...register('password')} type="password" placeholder="Min. 8 characters" className="mt-1" />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <Label>Confirm Password *</Label>
            <Input {...register('password_confirm')} type="password" placeholder="Repeat password" className="mt-1" />
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
  )
}
