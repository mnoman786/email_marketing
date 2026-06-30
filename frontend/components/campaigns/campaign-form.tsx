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
import { ArrowLeft, Save, Play, Plus, Trash2, ChevronUp, ChevronDown, Clock, Info, Mail, Server, Users, Check, X, FlaskConical, CheckCircle2, AlertCircle } from 'lucide-react'
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

interface LocalVariant {
  id?: number
  label: string
  subject: string
  html_content: string
  text_content: string
  weight: number
}

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
  auto_optimize: boolean
  auto_optimize_metric: 'open_rate' | 'click_rate' | 'reply_rate'
  auto_optimize_min_sends: number
  variants: LocalVariant[]
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
    auto_optimize: s.auto_optimize ?? false,
    auto_optimize_metric: s.auto_optimize_metric ?? 'reply_rate',
    auto_optimize_min_sends: s.auto_optimize_min_sends ?? 30,
    variants: (s.variants || []).map(v => ({
      id: v.id,
      label: v.label,
      subject: v.subject,
      html_content: v.html_content,
      text_content: v.text_content,
      weight: v.weight,
    })),
  }))
}

const VARIANT_LETTERS = 'ABCDEFGHIJ'

function nextVariantLabel(variants: LocalVariant[]) {
  return VARIANT_LETTERS[variants.length] || String(variants.length + 1)
}

interface Props {
  campaign?: Campaign
}

export function CampaignForm({ campaign }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'details' | 'steps' | 'smtp'>('details')
  const [steps, setSteps] = useState<LocalStep[]>(
    toLocalSteps(campaign?.steps).length ? toLocalSteps(campaign?.steps) : [
      {
        order: 1, subject: '', html_content: '', text_content: '', delay_days: 0, delay_hours: 0,
        stop_on_open: false, stop_on_click: false,
        auto_optimize: false, auto_optimize_metric: 'reply_rate', auto_optimize_min_sends: 30,
        variants: [],
      },
    ]
  )
  const [deletedStepIds, setDeletedStepIds] = useState<number[]>([])
  const [deletedVariants, setDeletedVariants] = useState<{ stepId: number; variantId: number }[]>([])
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

  const name = watch('name')
  const fromName = watch('from_name')
  const fromEmail = watch('from_email')
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

  const selectedListObjs = (lists || []).filter((l: any) => selectedLists.includes(l.id))
  const totalContacts = selectedListObjs.reduce((sum: number, l: any) => sum + (l.contact_count || 0), 0)

  // Per-tab completeness — drives the progress indicators and gates activation.
  const stepIsFilled = (s: LocalStep) =>
    s.variants.length > 0
      ? s.variants.every(v => v.subject.trim() && v.html_content.trim())
      : Boolean(s.subject.trim() && s.html_content.trim())

  const detailsValid = Boolean((name || '').trim()) && selectedLists.length > 0
  const stepsValid = steps.length > 0 && steps.every(stepIsFilled)
  const smtpValid = !useCustomSMTP || smtpRoutes.length > 0
  const canActivate = detailsValid && stepsValid && smtpValid

  const missing: string[] = []
  if (!(name || '').trim()) missing.push('campaign name')
  if (selectedLists.length === 0) missing.push('at least one target list')
  if (steps.length === 0) missing.push('at least one step')
  else if (!steps.every(stepIsFilled)) missing.push('subject & body for every step/variant')
  if (useCustomSMTP && smtpRoutes.length === 0) missing.push('at least one SMTP account')

  const tabValid: Record<string, boolean> = { details: detailsValid, steps: stepsValid, smtp: smtpValid }

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
      auto_optimize: false, auto_optimize_metric: 'reply_rate', auto_optimize_min_sends: 30,
      variants: [],
    }])
  }

  const removeStep = (index: number) => {
    setSteps(prev => {
      const removed = prev[index]
      if (removed.id) setDeletedStepIds(ids => [...ids, removed.id!])
      return prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  const addVariant = (index: number) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s
      if (s.variants.length === 0) {
        return {
          ...s,
          variants: [
            { label: 'A', subject: s.subject, html_content: s.html_content, text_content: s.text_content, weight: 10 },
            { label: 'B', subject: '', html_content: '', text_content: '', weight: 10 },
          ],
        }
      }
      return { ...s, variants: [...s.variants, { label: nextVariantLabel(s.variants), subject: '', html_content: '', text_content: '', weight: 10 }] }
    }))
  }

  const updateVariant = (index: number, vIndex: number, patch: Partial<LocalVariant>) => {
    setSteps(prev => prev.map((s, i) => i !== index ? s : {
      ...s,
      variants: s.variants.map((v, vi) => vi === vIndex ? { ...v, ...patch } : v),
    }))
  }

  const removeVariant = (index: number, vIndex: number) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s
      const removed = s.variants[vIndex]
      if (removed.id && s.id) setDeletedVariants(v => [...v, { stepId: s.id!, variantId: removed.id! }])
      const remaining = s.variants.filter((_, vi) => vi !== vIndex)
      if (remaining.length <= 1) {
        // Collapse back to plain mode, keeping whatever content is left.
        const survivor = remaining[0]
        if (survivor?.id && s.id) setDeletedVariants(v => [...v, { stepId: s.id!, variantId: survivor.id! }])
        return {
          ...s,
          subject: survivor ? survivor.subject : s.subject,
          html_content: survivor ? survivor.html_content : s.html_content,
          text_content: survivor ? survivor.text_content : s.text_content,
          variants: [],
        }
      }
      return { ...s, variants: remaining }
    }))
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
    for (const { stepId, variantId } of deletedVariants) {
      if (deletedStepIds.includes(stepId)) continue // cascade already removed it
      await campaignsApi.deleteVariant(campaignId, stepId, variantId)
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
        auto_optimize: step.auto_optimize,
        auto_optimize_metric: step.auto_optimize_metric,
        auto_optimize_min_sends: step.auto_optimize_min_sends,
      }
      const stepId = step.id
        ? (await campaignsApi.updateStep(campaignId, step.id, payload)).data.id
        : (await campaignsApi.createStep(campaignId, payload)).data.id

      for (const variant of step.variants) {
        const variantPayload = {
          label: variant.label,
          subject: variant.subject,
          html_content: variant.html_content,
          text_content: variant.text_content,
          weight: variant.weight,
        }
        if (variant.id) {
          await campaignsApi.updateVariant(campaignId, stepId, variant.id, variantPayload)
        } else {
          await campaignsApi.createVariant(campaignId, stepId, variantPayload)
        }
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
        <div className="flex items-center gap-3">
          {!canActivate && (
            <p className="hidden md:block text-xs text-muted-foreground max-w-xs text-right">
              To activate, add {missing.join(', ')}.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSubmit(d => saveMut.mutate(d))} loading={saveMut.isPending}>
              <Save size={15} /> Save Draft
            </Button>
            <Button
              onClick={handleSubmit(d => activateMut.mutate(d))}
              loading={activateMut.isPending}
              disabled={!canActivate}
              title={canActivate ? undefined : `Missing: ${missing.join(', ')}`}
            >
              <Play size={15} /> Save &amp; Activate
            </Button>
          </div>
        </div>
      </div>

      <div className="flex border-b bg-card px-6 gap-1">
        {[
          { key: 'details', label: 'Details', icon: Info, hint: 'Name, sender, lists & tracking' },
          { key: 'steps', label: 'Steps', icon: Mail, count: steps.length, hint: 'Email sequence' },
          { key: 'smtp', label: 'SMTP Routing', icon: Server, hint: 'Sending accounts' },
        ].map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon size={15} />
              {t.label}
              {typeof t.count === 'number' && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {t.count}
                </span>
              )}
              {tabValid[t.key]
                ? <CheckCircle2 size={14} className="text-green-600" />
                : <AlertCircle size={14} className="text-amber-500" />}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-6 items-start">
          <div className="min-w-0">
        {tab === 'details' && (
          <div className="space-y-5">
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
                    <Label>Open & Click Tracking</Label>
                    <p className="text-xs text-muted-foreground">Track when recipients open each step and click links inside it</p>
                  </div>
                  <Switch
                    checked={trackOpens && trackClicks}
                    onCheckedChange={v => {
                      setValue('track_opens', v)
                      setValue('track_clicks', v)
                    }}
                  />
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
          <div className="space-y-4">
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
                  {step.variants.length === 0 ? (
                    <>
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
                      <Button type="button" variant="outline" size="sm" onClick={() => addVariant(index)}>
                        <Plus size={13} /> Add Variant (A/B test)
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Variants (weighted A/B test)</Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => addVariant(index)}>
                          <Plus size={13} /> Add Variant
                        </Button>
                      </div>
                      {step.variants.map((variant, vIndex) => (
                        <div key={variant.id ?? `new-${vIndex}`} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">Variant {variant.label}</span>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Weight</Label>
                              <Input
                                type="number" min={1}
                                value={variant.weight}
                                onChange={e => updateVariant(index, vIndex, { weight: Number(e.target.value) })}
                                className="w-16 h-7 text-xs"
                              />
                              <Button
                                variant="ghost" size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => removeVariant(index, vIndex)}
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Subject *</Label>
                            <Input
                              value={variant.subject}
                              onChange={e => updateVariant(index, vIndex, { subject: e.target.value })}
                              placeholder="Quick question about {{company}}"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Email Body (HTML)</Label>
                            <Textarea
                              value={variant.html_content}
                              onChange={e => updateVariant(index, vIndex, { html_content: e.target.value })}
                              placeholder="<p>Hi {{first_name}}, ...</p>"
                              className="font-mono text-xs h-28 mt-1"
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Each send randomly picks a variant in proportion to its weight.
                      </p>

                      {step.variants.length > 1 && (
                        <div className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Auto-optimize</Label>
                              <p className="text-xs text-muted-foreground">
                                Once every variant has enough sends, automatically deactivate the rest and keep only the best performer
                              </p>
                            </div>
                            <Switch
                              checked={step.auto_optimize}
                              onCheckedChange={v => updateStep(index, { auto_optimize: v })}
                            />
                          </div>
                          {step.auto_optimize && (
                            <div className="grid grid-cols-2 gap-3 pt-1">
                              <div>
                                <Label className="text-xs">Winning Metric</Label>
                                <select
                                  value={step.auto_optimize_metric}
                                  onChange={e => updateStep(index, { auto_optimize_metric: e.target.value as LocalStep['auto_optimize_metric'] })}
                                  className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
                                >
                                  <option value="open_rate">Open Rate</option>
                                  <option value="click_rate">Click Rate</option>
                                  <option value="reply_rate">Reply Rate</option>
                                </select>
                              </div>
                              <div>
                                <Label className="text-xs">Min Sends per Variant</Label>
                                <Input
                                  type="number" min={1}
                                  value={step.auto_optimize_min_sends}
                                  onChange={e => updateStep(index, { auto_optimize_min_sends: Number(e.target.value) })}
                                  className="mt-1"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
          <div className="space-y-5">
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

          {/* Live summary — see the whole campaign at a glance */}
          <aside className="hidden lg:block">
            <Card className="sticky top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Campaign</p>
                  <p className="font-medium truncate">{name || <span className="text-muted-foreground italic">Untitled</span>}</p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Mail size={12} /> Sender</p>
                  {fromEmail || fromName ? (
                    <p className="text-xs leading-relaxed">
                      {fromName && <span className="font-medium">{fromName}</span>}
                      {fromEmail && <span className="text-muted-foreground"> &lt;{fromEmail}&gt;</span>}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Uses SMTP account defaults</p>
                  )}
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Users size={12} /> Audience</p>
                  {selectedListObjs.length ? (
                    <>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {selectedListObjs.map((l: any) => (
                          <span key={l.id} className="text-xs rounded-full bg-muted px-2 py-0.5">{l.name}</span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{totalContacts.toLocaleString()} contacts enrolled</p>
                    </>
                  ) : (
                    <p className="text-xs text-destructive">No lists selected</p>
                  )}
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Mail size={12} /> Sequence</p>
                  <div className="space-y-1.5">
                    {steps.map((s, i) => (
                      <div key={s.id ?? `sum-${i}`} className="flex items-center gap-2 text-xs">
                        <span className="flex-none w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">{s.order}</span>
                        <span className="truncate flex-1">
                          {s.variants.length > 1
                            ? <span className="inline-flex items-center gap-1"><FlaskConical size={11} /> {s.variants.length} variants</span>
                            : (s.variants[0]?.subject || s.subject || <span className="text-muted-foreground italic">No subject</span>)}
                        </span>
                        {i > 0 && <span className="flex-none text-muted-foreground flex items-center gap-0.5"><Clock size={10} />{s.delay_days}d{s.delay_hours ? ` ${s.delay_hours}h` : ''}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground mb-1">Settings</p>
                  <SummaryFlag on={trackOpens && trackClicks} label="Open & click tracking" />
                  <SummaryFlag on={stopOnReply} label="Stop on reply" />
                  <SummaryFlag on={scheduleEnabled} label={scheduleEnabled ? `Business hours (${scheduleStartTime}–${scheduleEndTime})` : 'Send anytime'} forceCheck={!scheduleEnabled} />
                  <div className="flex items-center gap-2 text-xs">
                    <Server size={13} className="text-muted-foreground flex-none" />
                    <span>{useCustomSMTP ? `Custom routing (${smtpRoutes.length})` : 'All active SMTP accounts'}</span>
                  </div>
                </div>

                {canActivate ? (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <CheckCircle2 size={14} className="text-green-600 flex-none" /> Ready to activate
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1.5">
                      <AlertCircle size={14} className="text-amber-500 flex-none" /> Not ready yet
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-xs text-muted-foreground">
                      {missing.map(m => <li key={m}>Add {m}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  )
}

function SummaryFlag({ on, label, forceCheck }: { on?: boolean; label: string; forceCheck?: boolean }) {
  const checked = on || forceCheck
  return (
    <div className="flex items-center gap-2 text-xs">
      {checked
        ? <Check size={13} className="text-green-600 flex-none" />
        : <X size={13} className="text-muted-foreground flex-none" />}
      <span className={checked ? '' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}
