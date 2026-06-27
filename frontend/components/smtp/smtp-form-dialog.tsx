'use client'
import { useEffect, useState } from 'react'
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
import { FlaskConical, CheckCircle, XCircle } from 'lucide-react'
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
  imap_enabled: z.boolean().optional(),
  imap_host: z.string().optional(),
  imap_port: z.number().optional(),
  imap_username: z.string().optional(),
  imap_password: z.string().optional(),
  imap_use_ssl: z.boolean().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
  onSaved: () => void
}

export function SMTPFormDialog({ open, onClose, account, onSaved }: Props) {
  const [tab, setTab] = useState<'sending' | 'imap'>('sending')
  const { register, handleSubmit, reset, setValue, watch, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      security: 'tls',
      weight: 10,
      is_active: true,
      port: 587,
      daily_limit: 0,
      hourly_limit: 0,
      imap_enabled: false,
      imap_port: 993,
      imap_use_ssl: true,
    },
  })

  const security = watch('security')
  const isActive = watch('is_active')
  const imapEnabled = watch('imap_enabled')

  useEffect(() => {
    if (!open) return
    setTab('sending')
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
        imap_enabled: account.imap_enabled,
        imap_host: account.imap_host,
        imap_port: account.imap_port,
        imap_username: account.imap_username,
        imap_password: '',
        imap_use_ssl: account.imap_use_ssl,
      })
    } else {
      reset({
        name: '', host: '', port: 587, username: '', password: '', from_email: '', from_name: '',
        security: 'tls', weight: 10, is_active: true, daily_limit: 0, hourly_limit: 0,
        imap_enabled: false, imap_host: '', imap_port: 993, imap_username: '', imap_password: '', imap_use_ssl: true,
      })
    }
  }, [account, open, reset])

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

  const imapTestMutation = useMutation({
    mutationFn: () => {
      // Tests whatever is currently typed in the form — nothing is saved.
      const v = getValues()
      const payload = {
        imap_host: v.imap_host,
        imap_port: v.imap_port,
        imap_username: v.imap_username,
        imap_password: v.imap_password,
        imap_use_ssl: v.imap_use_ssl,
      }
      // Editing an existing account: omitted/blank password falls back to the
      // one already saved, so you don't have to retype it just to test.
      return account ? smtpApi.testImap(account.id, payload) : smtpApi.testImapUnsaved(payload)
    },
    onSuccess: (res) => toast.success(res.data.message || 'IMAP connection successful'),
    onError: (err: any) => toast.error(err.response?.data?.detail || 'IMAP test failed'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{account ? 'Edit SMTP Account' : 'Add SMTP Account'}</DialogTitle>
        </DialogHeader>

        <div className="flex border-b px-6 mt-3">
          {[
            { key: 'sending', label: 'Sending' },
            { key: 'imap', label: 'Reply Detection (IMAP)' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as any)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.key === 'imap' && imapEnabled && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'sending' && (
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

                <div className="col-span-2 flex items-center justify-between pt-1">
                  <Label>Active</Label>
                  <Switch checked={isActive} onCheckedChange={v => setValue('is_active', v)} />
                </div>
              </div>
            )}

            {tab === 'imap' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Reply Detection</Label>
                    <p className="text-xs text-muted-foreground">Poll this mailbox for replies to sent emails</p>
                  </div>
                  <Switch checked={!!imapEnabled} onCheckedChange={v => setValue('imap_enabled', v)} />
                </div>

                {imapEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IMAP Host *</Label>
                      <Input {...register('imap_host')} placeholder="imap.gmail.com" className="mt-1" />
                    </div>
                    <div>
                      <Label>IMAP Port *</Label>
                      <Input {...register('imap_port', { valueAsNumber: true })} type="number" placeholder="993" className="mt-1" />
                    </div>
                    <div>
                      <Label>IMAP Username *</Label>
                      <Input {...register('imap_username')} placeholder="you@gmail.com" className="mt-1" />
                    </div>
                    <div>
                      <Label>{account ? 'IMAP Password (leave blank to keep)' : 'IMAP Password *'}</Label>
                      <Input {...register('imap_password')} type="password" placeholder="App password" className="mt-1" />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <Label>Use SSL (port 993)</Label>
                      <Switch
                        checked={watch('imap_use_ssl') ?? true}
                        onCheckedChange={v => setValue('imap_use_ssl', v)}
                      />
                    </div>

                    <div className="col-span-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                      Use the <strong>same email account</strong> you send from. Most providers want an{' '}
                      <strong>app password</strong> here, not your normal login password — see below for where to get one.
                    </div>

                    <div className="col-span-2">
                      <Button
                        type="button" variant="outline" size="sm"
                        onClick={() => imapTestMutation.mutate()}
                        loading={imapTestMutation.isPending}
                      >
                        <FlaskConical size={13} /> Test IMAP Connection
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">Tests the credentials above directly — nothing is saved.</p>
                      {account?.last_imap_test_success !== null && account?.last_imap_test_success !== undefined && (
                        <span className={`ml-2 inline-flex items-center gap-1 text-xs ${account.last_imap_test_success ? 'text-green-600' : 'text-red-500'}`}>
                          {account.last_imap_test_success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {account.last_imap_test_success ? 'Last test passed' : 'Last test failed'}
                          </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t">
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
