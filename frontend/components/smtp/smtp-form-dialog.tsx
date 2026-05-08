'use client'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { smtpApi } from '@/lib/api'
import { SMTPAccount } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import toast from 'react-hot-toast'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  host: z.string().min(1, 'Host required'),
  port: z.number().min(1).max(65535),
  username: z.string().min(1, 'Username required'),
  password: z.string().optional(),
  from_email: z.string().email('Invalid email'),
  from_name: z.string().min(1, 'From name required'),
  security: z.enum(['none', 'tls', 'ssl']),
  weight: z.number().min(1).max(1000),
  is_active: z.boolean(),
  daily_limit: z.number().min(0),
  hourly_limit: z.number().min(0),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
  onSaved: () => void
}

export function SMTPFormDialog({ open, onClose, account, onSaved }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      security: 'tls',
      weight: 10,
      is_active: true,
      port: 587,
      daily_limit: 0,
      hourly_limit: 0,
    },
  })

  const security = watch('security')
  const isActive = watch('is_active')

  useEffect(() => {
    if (account) {
      reset({
        name: account.name,
        host: account.host,
        port: account.port,
        username: account.username,
        password: '',
        from_email: account.from_email,
        from_name: account.from_name,
        security: account.security,
        weight: account.weight,
        is_active: account.is_active,
        daily_limit: account.daily_limit,
        hourly_limit: account.hourly_limit,
      })
    } else {
      reset({ name: '', host: '', port: 587, username: '', password: '', from_email: '', from_name: '', security: 'tls', weight: 10, is_active: true, daily_limit: 0, hourly_limit: 0 })
    }
  }, [account, reset])

  // Auto-set port based on security
  const onSecurityChange = (val: string) => {
    setValue('security', val as any)
    if (val === 'ssl') setValue('port', 465)
    else if (val === 'tls') setValue('port', 587)
    else setValue('port', 25)
  }

  const mutation = useMutation({
    mutationFn: (data: FormData) => account
      ? smtpApi.update(account.id, data)
      : smtpApi.create(data),
    onSuccess: () => {
      toast.success(account ? 'SMTP account updated' : 'SMTP account created')
      onSaved()
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to save SMTP account')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{account ? 'Edit SMTP Account' : 'Add SMTP Account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Account Name *</Label>
              <Input {...register('name')} placeholder="Primary Gmail" className="mt-1" />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <Label>SMTP Host *</Label>
              <Input {...register('host')} placeholder="smtp.gmail.com" className="mt-1" />
              {errors.host && <p className="text-xs text-destructive mt-1">{errors.host.message}</p>}
            </div>
            <div>
              <Label>Port *</Label>
              <Input
                {...register('port', { valueAsNumber: true })}
                type="number"
                placeholder="587"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Security</Label>
              <Select value={security} onValueChange={onSecurityChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS/STARTTLS (587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (465)</SelectItem>
                  <SelectItem value="none">None (25)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Routing Weight</Label>
              <Input
                {...register('weight', { valueAsNumber: true })}
                type="number"
                min={1}
                max={1000}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Higher = more traffic</p>
            </div>

            <div>
              <Label>Username *</Label>
              <Input {...register('username')} placeholder="you@gmail.com" className="mt-1" />
            </div>
            <div>
              <Label>{account ? 'Password (leave blank to keep)' : 'Password *'}</Label>
              <Input
                {...register('password')}
                type="password"
                placeholder="App password"
                className="mt-1"
              />
            </div>

            <div>
              <Label>From Email *</Label>
              <Input {...register('from_email')} placeholder="noreply@yourdomain.com" className="mt-1" />
              {errors.from_email && <p className="text-xs text-destructive mt-1">{errors.from_email.message}</p>}
            </div>
            <div>
              <Label>From Name *</Label>
              <Input {...register('from_name')} placeholder="Your Company" className="mt-1" />
            </div>

            <div>
              <Label>Daily Limit (0 = unlimited)</Label>
              <Input {...register('daily_limit', { valueAsNumber: true })} type="number" min={0} className="mt-1" />
            </div>
            <div>
              <Label>Hourly Limit (0 = unlimited)</Label>
              <Input {...register('hourly_limit', { valueAsNumber: true })} type="number" min={0} className="mt-1" />
            </div>

            <div className="col-span-2 flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={v => setValue('is_active', v)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>
              {account ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
