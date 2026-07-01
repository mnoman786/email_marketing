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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FlaskConical, CheckCircle, XCircle, Send, Inbox, ArrowRight, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'sending', label: 'Sending', icon: Send },
  { key: 'imap', label: 'Reply Detection', icon: Inbox },
] as const
type StepKey = typeof STEPS[number]['key']

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  host: z.string().min(1, 'Host required'),
  port: z.number().min(1).max(65535),
  username: z.string().min(1, 'Username required'),
  password: z.string().optional(),
  from_email: z.string().email('Invalid email'),
  from_name: z.string().min(1, 'From name required'),
  security: z.enum(['none', 'tls', 'ssl']),
  is_active: z.boolean(),
  daily_limit: z.number().min(0),
  hourly_limit: z.number().min(0),
  imap_enabled: z.boolean().optional(),
  imap_host: z.string().optional(),
  imap_port: z.number().optional(),
  imap_username: z.string().optional(),
  imap_password: z.string().optional(),
  imap_use_ssl: z.boolean().optional(),
  capture_cold_leads: z.boolean().optional(),
  signature_html: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  account: SMTPAccount | null
  onSaved: () => void
}

export function SMTPFormDialog({ open, onClose, account, onSaved }: Props) {
  const [tab, setTab] = useState<StepKey>('sending')
  const stepIndex = STEPS.findIndex(s => s.key === tab)
  const isLastStep = stepIndex === STEPS.length - 1
  const { register, handleSubmit, reset, setValue, watch, getValues, trigger, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      security: 'tls',
      is_active: true,
      port: 587,
      daily_limit: 0,
      hourly_limit: 0,
      imap_enabled: false,
      imap_port: 993,
      imap_use_ssl: true,
      capture_cold_leads: false,
      signature_html: '',
    },
  })

  const security = watch('security')
  const isActive = watch('is_active')
  const imapEnabled = watch('imap_enabled')
  const imapHostVal = watch('imap_host')
  const imapUsernameVal = watch('imap_username')
  const imapPasswordVal = watch('imap_password')
  // Zod only enforces the always-required Sending fields — IMAP fields are
  // conditionally required (only when the toggle is on), so factor that in
  // separately rather than baking optional-until-enabled fields into the schema.
  const canSubmit = isValid && (!imapEnabled || (!!imapHostVal && !!imapUsernameVal && (!!account || !!imapPasswordVal)))

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
        is_active: account.is_active,
        daily_limit: account.daily_limit,
        hourly_limit: account.hourly_limit,
        imap_enabled: account.imap_enabled,
        imap_host: account.imap_host,
        imap_port: account.imap_port,
        imap_username: account.imap_username,
        imap_password: '',
        imap_use_ssl: account.imap_use_ssl,
        capture_cold_leads: account.capture_cold_leads,
        signature_html: account.signature_html,
      })
    } else {
      reset({
        name: '', host: '', port: 587, username: '', password: '', from_email: '', from_name: '',
        security: 'tls', is_active: true, daily_limit: 0, hourly_limit: 0,
        imap_enabled: false, imap_host: '', imap_port: 993, imap_username: '', imap_password: '', imap_use_ssl: true,
        capture_cold_leads: false, signature_html: '',
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

  const goToStep = (key: StepKey) => setTab(key)

  const handleNext = async () => {
    if (tab === 'sending') {
      const ok = await trigger(['name', 'host', 'port', 'username', 'from_email', 'from_name'])
      if (ok) goToStep('imap')
      return
    }
    if (tab === 'imap') {
      const v = getValues()
      if (v.imap_enabled && (!v.imap_host || !v.imap_username || (!account && !v.imap_password))) {
        toast.error('Fill in IMAP host, username, and password — or turn off Reply Detection to skip this step.')
        return
      }
    }
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{account ? 'Edit SMTP Account' : 'Add SMTP Account'}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center px-6 mt-4 mb-1">
          {STEPS.map((s, i) => {
            const isActive = tab === s.key
            const isDone = i < stepIndex
            return (
              <div key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                <button
                  type="button"
                  onClick={() => goToStep(s.key)}
                  className="flex items-center gap-2 shrink-0"
                >
                  <span className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 shrink-0 transition-colors',
                    isActive ? 'border-primary bg-primary text-primary-foreground'
                      : isDone ? 'border-primary text-primary'
                      : 'border-muted-foreground/30 text-muted-foreground'
                  )}>
                    {isDone ? <Check size={14} /> : <s.icon size={13} />}
                  </span>
                  <span className={cn('text-sm font-medium hidden sm:inline', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                    {s.label}
                  </span>
                  {s.key === 'imap' && (
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', imapEnabled ? 'bg-green-500' : 'bg-muted-foreground/30')} />
                  )}
                </button>
                {i < STEPS.length - 1 && <div className={cn('flex-1 h-px mx-3', isDone ? 'bg-primary' : 'bg-border')} />}
              </div>
            )
          })}
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'sending' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Account Name *</Label>
                  <Input {...register('name')} placeholder="Primary Gmail" className="mt-1" autoComplete="off" />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <Label>SMTP Host *</Label>
                  <Input {...register('host')} placeholder="smtp.gmail.com" className="mt-1" autoComplete="off" />
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
                  <Label>Username *</Label>
                  <Input {...register('username')} placeholder="you@gmail.com" className="mt-1" autoComplete="username" />
                </div>
                <div>
                  <Label>{account ? 'Password (leave blank to keep)' : 'Password *'}</Label>
                  <Input
                    {...register('password')}
                    type="password"
                    placeholder="App password"
                    className="mt-1"
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <Label>From Email *</Label>
                  <Input {...register('from_email')} placeholder="noreply@yourdomain.com" className="mt-1" autoComplete="email" />
                  {errors.from_email && <p className="text-xs text-destructive mt-1">{errors.from_email.message}</p>}
                </div>
                <div>
                  <Label>From Name *</Label>
                  <Input {...register('from_name')} placeholder="Your Company" className="mt-1" autoComplete="name" />
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

                <div className="col-span-2">
                  <Label>Signature</Label>
                  <Textarea
                    {...register('signature_html')}
                    placeholder="Best,&#10;Your Name&#10;Your Company"
                    className="mt-1 h-24 font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Appended to outgoing emails sent from this account.</p>
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
                      <Input {...register('imap_host')} placeholder="imap.gmail.com" className="mt-1" autoComplete="off" />
                    </div>
                    <div>
                      <Label>IMAP Port *</Label>
                      <Input {...register('imap_port', { valueAsNumber: true })} type="number" placeholder="993" className="mt-1" autoComplete="off" />
                    </div>
                    <div>
                      <Label>IMAP Username *</Label>
                      <Input {...register('imap_username')} placeholder="you@gmail.com" className="mt-1" autoComplete="username" />
                    </div>
                    <div>
                      <Label>{account ? 'IMAP Password (leave blank to keep)' : 'IMAP Password *'}</Label>
                      <Input {...register('imap_password')} type="password" placeholder="App password" className="mt-1" autoComplete="current-password" />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      <Label>Use SSL (port 993)</Label>
                      <Switch
                        checked={watch('imap_use_ssl') ?? true}
                        onCheckedChange={v => setValue('imap_use_ssl', v)}
                      />
                    </div>

                    <div className="col-span-2 flex items-start justify-between gap-3">
                      <div>
                        <Label>Capture cold inbound leads</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When someone you&rsquo;ve never emailed writes in, create a new lead thread.
                          Off by default — automated mail (password resets, OTPs, receipts, newsletters)
                          is always ignored, but leaving this off keeps the inbox to replies on mail you sent.
                        </p>
                      </div>
                      <Switch
                        checked={watch('capture_cold_leads') ?? false}
                        onCheckedChange={v => setValue('capture_cold_leads', v)}
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
            {stepIndex > 0 && (
              <Button type="button" variant="outline" onClick={() => goToStep(STEPS[stepIndex - 1].key)}>
                Back
              </Button>
            )}
            {!isLastStep ? (
              <Button type="button" onClick={handleNext}>
                Next <ArrowRight size={14} />
              </Button>
            ) : (
              <Button type="submit" loading={mutation.isPending} disabled={!canSubmit}>
                {account ? 'Update' : 'Create'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
