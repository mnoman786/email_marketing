'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { campaignsApi, listsApi, smtpApi } from '@/lib/api'
import { Campaign, CampaignStep } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SendingScheduleCard } from '@/components/shared/sending-schedule-card'
import { ArrowLeft, Save, Play, Plus, Trash2, ChevronUp, ChevronDown, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  from_name: z.string().optional(),
  from_email: z.string().email().optional().or(z.literal('')),
  reply_to: z.string().email().optional().or(z.literal('')),
  contact_list_ids: z.array(z.number()).min(1, 'Select at least one list'),
  track_opens: z.boolean().optional(),
  track_clicks: z.boolean().optional(),
  stop_on_reply: z.boolean().optional(),
  use_custom_smtp_routing: z.boolean().optional(),
  schedule_enabled: z.boolean().optional(),
  schedule_days: z.array(z.number()).optional(),
  schedule_start_time: z.string().optional(),
  schedule_end_time: z.string().optional(),
  schedule_timezone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface LocalStep {
  id?: number
  order: number
  subject: string
  html_content: string
  text_content: string
  delay_days: number
  delay_hours: number
  stop_on_open: boolean
  stop_on_click: boolean
}

function toLocalSteps(steps?: CampaignStep[]): LocalStep[] {
  return (steps || []).map(s => ({
    id: s.id,
    order: s.order,
    subject: s.subject,
    html_content: s.html_content,
    text_content: s.text_content,
    delay_days: s.delay_days,
    delay_hours: s.delay_hours,
    stop_on_open: s.stop_on_open,
    stop_on_click: s.stop_on_click,
  }))
}

interface Props {
  campaign?: Campaign
}

export function CampaignForm({ campaign }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'details' | 'steps' | 'smtp'>('details')
  const [steps, setSteps] = useState<LocalStep[]>(
    toLocalSteps(campaign?.steps).length ? toLocalSteps(campaign?.steps) : [
      { order: 1, subject: '', html_content: '', text_content: '', delay_days: 0, delay_hours: 0, stop_on_open: false, stop_on_click: false },
    ]
  )
  const [deletedStepIds, setDeletedStepIds] = useState<number[]>([])
  const [smtpRoutes, setSmtpRoutes] = useState<{ smtp_account: number; weight: number }[]>([])

  const { data: lists } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
    staleTime: 0,
  })

  const { data: smtpAccounts } = useQuery({
    queryKey: ['smtp-accounts'],
    queryFn: () => smtpApi.getAll().then(r => r.data.items || []),
  })

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: campaign?.name || '',
      from_name: campaign?.from_name || '',
      from_email: campaign?.from_email || '',
      reply_to: campaign?.reply_to || '',
      contact_list_ids: campaign?.contact_list_ids || [],
      track_opens: campaign?.track_opens ?? true,
      track_clicks: campaign?.track_clicks ?? true,
      stop_on_reply: campaign?.stop_on_reply ?? true,
      use_custom_smtp_routing: campaign?.use_custom_smtp_routing ?? false,
      schedule_enabled: campaign?.schedule_enabled ?? false,
      schedule_days: campaign?.schedule_days ?? [0, 1, 2, 3, 4],
      schedule_start_time: campaign?.schedule_start_time?.slice(0, 5) ?? '09:00',
      schedule_end_time: campaign?.schedule_end_time?.slice(0, 5) ?? '17:00',
      schedule_timezone: campaign?.schedule_timezone ?? 'UTC',
    },
  })

  const selectedLists = watch('contact_list_ids') || []
  const trackOpens = watch('track_opens')
  const trackClicks = watch('track_clicks')
  const stopOnReply = watch('stop_on_reply')
  const useCustomSMTP = watch('use_custom_smtp_routing')
  const scheduleEnabled = watch('schedule_enabled') ?? false
  const scheduleDays = watch('schedule_days') ?? [0, 1, 2, 3, 4]
  const scheduleStartTime = watch('schedule_start_time') ?? '09:00'
  const scheduleEndTime = watch('schedule_end_time') ?? '17:00'
  const scheduleTimezone = watch('schedule_timezone') ?? 'UTC'

  const toggleList = (id: number) => {
    setValue('contact_list_ids', selectedLists.includes(id)
      ? selectedLists.filter(x => x !== id)
      : [...selectedLists, id]
    )
  }

  const addSmtpRoute = (accountId: number) => {
    if (!smtpRoutes.find(r => r.smtp_account === accountId)) {
      setSmtpRoutes([...smtpRoutes, { smtp_account: accountId, weight: 10 }])
    }
  }

  const addStep = () => {
    setSteps(prev => [...prev, {
      order: prev.length + 1, subject: '', html_content: '', text_content: '',
      delay_days: prev.length === 0 ? 0 : 3, delay_hours: 0,
      stop_on_open: false, stop_on_click: false,
    }])
  }

  const removeStep = (index: number) => {
    setSteps(prev => {
      const removed = prev[index]
      if (removed.id) setDeletedStepIds(ids => [...ids, removed.id!])
      return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const updateStep = (index: number, patch: Partial<LocalStep>) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  async function persistSteps(campaignId: number) {
    for (const stepId of deletedStepIds) {
      await campaignsApi.deleteStep(campaignId, stepId)
    }
    for (const step of steps) {
      const payload = {
        order: step.order,
        subject: step.subject,
        html_content: step.html_content,
        text_content: step.text_content,
        delay_days: step.delay_days,
        delay_hours: step.delay_hours,
        stop_on_open: step.stop_on_open,
        stop_on_click: step.stop_on_click,
      }
      if (step.id) {
        await campaignsApi.updateStep(campaignId, step.id, payload)
      } else {
        await campaignsApi.createStep(campaignId, payload)
      }
    }
  }

  const saveMut = useMutation({
    mutationFn: async (data: FormData) => {
      const res = campaign
        ? await campaignsApi.update(campaign.id, data)
        : await campaignsApi.create(data)
      await persistSteps(res.data.id)
      if (useCustomSMTP && smtpRoutes.length > 0) {
        await campaignsApi.updateSmtpRoutes(res.data.id, smtpRoutes)
      }
      return res.data
    },
    onSuccess: (data) => {
      toast.success(campaign ? 'Campaign saved' : 'Campaign created')
      router.push(`/campaigns/${data.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save'),
  })

  const activateMut = useMutation({
    mutationFn: async (data: FormData) => {
      const res = campaign
        ? await campaignsApi.update(campaign.id, data)
        : await campaignsApi.create(data)
      await persistSteps(res.data.id)
      if (useCustomSMTP && smtpRoutes.length > 0) {
        await campaignsApi.updateSmtpRoutes(res.data.id, smtpRoutes)
      }
      await campaignsApi.activate(res.data.id)
      return res.data
    },
    onSuccess: (data) => {
      toast.success('Campaign activated!')
      router.push(`/campaigns/${data.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to activate'),
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/campaigns')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="font-semibold">{campaign ? 'Edit Campaign' : 'New Campaign'}</h1>
            <p className="text-xs text-muted-foreground">Build a single email or a multi-step drip campaign</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSubmit(d => saveMut.mutate(d))} loading={saveMut.isPending}>
            <Save size={15} /> Save Draft
          </Button>
          <Button onClick={handleSubmit(d => activateMut.mutate(d))} loading={activateMut.isPending}>
            <Play size={15} /> Save &amp; Activate
          </Button>
        </div>
      </div>

      <div className="flex border-b bg-card px-6">
        {[
          { key: 'details', label: 'Details' },
          { key: 'steps', label: `Steps (${steps.length})` },
          { key: 'smtp', label: 'SMTP Routing' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'details' && (
          <div className="max-w-2xl space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Campaign Info</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Campaign Name *</Label>
                  <Input {...register('name')} placeholder="Cold Outreach - SaaS Founders" className="mt-1" />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Sender Info (leave blank to use SMTP defaults)</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>From Name</Label>
                    <Input {...register('from_name')} placeholder="Your Company" className="mt-1" />
                  </div>
                  <div>
                    <Label>From Email</Label>
                    <Input {...register('from_email')} type="email" placeholder="noreply@company.com" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Reply-To Email</Label>
                  <Input {...register('reply_to')} type="email" placeholder="support@company.com" className="mt-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Target Lists *</CardTitle></CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">
                  Contacts in these lists are automatically enrolled — including ones added later.
                </p>
                {errors.contact_list_ids && (
                  <p className="text-xs text-destructive mb-2">{errors.contact_list_ids.message}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {lists?.map((list: any) => (
                    <label key={list.id} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLists.includes(list.id)}
                        onChange={() => toggleList(list.id)}
                        className="rounded"
                      />
                      <div>
                        <p className="font-medium">{list.name}</p>
                        <p className="text-xs text-muted-foreground">{list.contact_count} contacts</p>
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Tracking</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Track Opens</Label>
                    <p className="text-xs text-muted-foreground">Track when recipients open each step</p>
                  </div>
                  <Switch checked={trackOpens} onCheckedChange={v => setValue('track_opens', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Track Clicks</Label>
                    <p className="text-xs text-muted-foreground">Track link clicks in each step</p>
                  </div>
                  <Switch checked={trackClicks} onCheckedChange={v => setValue('track_clicks', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Stop if contact replies</Label>
                    <p className="text-xs text-muted-foreground">
                      Halt the campaign as soon as a reply is detected (requires IMAP reply detection enabled on an SMTP account)
                    </p>
                  </div>
                  <Switch checked={stopOnReply} onCheckedChange={v => setValue('stop_on_reply', v)} />
                </div>
              </CardContent>
            </Card>

            <SendingScheduleCard
              value={{
                schedule_enabled: scheduleEnabled,
                schedule_days: scheduleDays,
                schedule_start_time: scheduleStartTime,
                schedule_end_time: scheduleEndTime,
                schedule_timezone: scheduleTimezone,
              }}
              onChange={patch => {
                Object.entries(patch).forEach(([key, val]) => setValue(key as any, val as any))
              }}
            />
          </div>
        )}

        {tab === 'steps' && (
          <div className="max-w-2xl space-y-4">
            {steps.map((step, index) => (
              <Card key={step.id ?? `new-${index}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    Step {step.order}
                    {index > 0 && (
                      <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                        <Clock size={11} />
                        wait {step.delay_days}d {step.delay_hours}h after step {step.order - 1}
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveStep(index, -1)}>
                      <ChevronUp size={14} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>
                      <ChevronDown size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeStep(index)}
                      disabled={steps.length === 1}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Subject *</Label>
                    <Input
                      value={step.subject}
                      onChange={e => updateStep(index, { subject: e.target.value })}
                      placeholder="Quick question about {{company}}"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Email Body (HTML)</Label>
                    <Textarea
                      value={step.html_content}
                      onChange={e => updateStep(index, { html_content: e.target.value })}
                      placeholder="<p>Hi {{first_name}}, ...</p>"
                      className="font-mono text-xs h-32 mt-1"
                    />
                  </div>

                  {index > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Wait Days</Label>
                        <Input
                          type="number" min={0}
                          value={step.delay_days}
                          onChange={e => updateStep(index, { delay_days: Number(e.target.value) })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Wait Hours</Label>
                        <Input
                          type="number" min={0}
                          value={step.delay_hours}
                          onChange={e => updateStep(index, { delay_hours: Number(e.target.value) })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <Label>Stop campaign if opened</Label>
                      <p className="text-xs text-muted-foreground">Skip remaining steps if this email is opened</p>
                    </div>
                    <Switch
                      checked={step.stop_on_open}
                      onCheckedChange={v => updateStep(index, { stop_on_open: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Stop campaign if clicked</Label>
                      <p className="text-xs text-muted-foreground">Skip remaining steps if a link in this email is clicked</p>
                    </div>
                    <Switch
                      checked={step.stop_on_click}
                      onCheckedChange={v => updateStep(index, { stop_on_click: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" onClick={addStep} className="w-full">
              <Plus size={15} /> Add Step
            </Button>
          </div>
        )}

        {tab === 'smtp' && (
          <div className="max-w-2xl space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">SMTP Routing</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Use Custom SMTP Routing</Label>
                    <p className="text-xs text-muted-foreground">Override default SMTP weights for this campaign</p>
                  </div>
                  <Switch checked={useCustomSMTP} onCheckedChange={v => setValue('use_custom_smtp_routing', v)} />
                </div>

                {useCustomSMTP && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Select SMTP accounts and set routing weights:</p>
                    {smtpAccounts?.map((account: any) => {
                      const route = smtpRoutes.find(r => r.smtp_account === account.id)
                      return (
                        <div key={account.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <input
                            type="checkbox"
                            checked={!!route}
                            onChange={() => route
                              ? setSmtpRoutes(smtpRoutes.filter(r => r.smtp_account !== account.id))
                              : addSmtpRoute(account.id)
                            }
                            className="rounded"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{account.name}</p>
                            <p className="text-xs text-muted-foreground">{account.from_email}</p>
                          </div>
                          {route && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Weight</Label>
                              <Input
                                type="number"
                                value={route.weight}
                                onChange={e => setSmtpRoutes(smtpRoutes.map(r =>
                                  r.smtp_account === account.id ? { ...r, weight: Number(e.target.value) } : r
                                ))}
                                className="w-16 h-7 text-xs"
                                min={1}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!useCustomSMTP && (
                  <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    <p>All active SMTP accounts will be used with their configured weights.</p>
                    <p className="mt-1">Enable custom routing above to set per-campaign weights.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
