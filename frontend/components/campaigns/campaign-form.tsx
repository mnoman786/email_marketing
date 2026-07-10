'use client'
import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { campaignsApi, listsApi, smtpApi } from '@/lib/api'
import { Campaign, CampaignStep } from '@/lib/types'
import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs } from '@/components/ui/tabs'
import { SendingScheduleCard } from '@/components/shared/sending-schedule-card'
import { EmailBodyEditor } from '@/components/campaigns/email-body-editor'
import { ArrowLeft, Save, Play, Plus, Trash2, ChevronUp, ChevronDown, Clock, Settings2, Mail, Users, Check, X, FlaskConical, CheckCircle2, AlertCircle, Eye, GitBranch, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const SUBJECT_CONTACT_TAGS = [
  { label: 'First Name', tag: 'first_name' },
  { label: 'Last Name',  tag: 'last_name'  },
  { label: 'Full Name',  tag: 'full_name'  },
  { label: 'Company',    tag: 'company'    },
  { label: 'Job Title',  tag: 'title'      },
  { label: 'City',       tag: 'city'       },
]
const SUBJECT_SENDER_TAGS = [
  { label: 'Your Name',    tag: 'sender_name'    },
  { label: 'Your Company', tag: 'sender_company' },
]

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  reply_to: z.string().email().optional().or(z.literal('')),
  contact_list_ids: z.array(z.number()).min(1, 'Select at least one list'),
  smtp_account_ids: z.array(z.number()).min(1, 'Select at least one sending account'),
  track_opens: z.boolean().optional(),
  track_clicks: z.boolean().optional(),
  stop_on_reply: z.boolean().optional(),
  daily_limit: z.number().int().positive().optional().nullable(),
  text_only: z.boolean().optional(),
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

interface LocalTransition {
  id?: number
  condition: 'opened' | 'not_opened' | 'clicked' | 'replied' | 'default'
  next_step_order: number | null  // null = end campaign
  wait_days: number
  wait_hours: number
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
  transitions: LocalTransition[]
}

function toLocalSteps(steps?: CampaignStep[]): LocalStep[] {
  const stepById = Object.fromEntries((steps || []).map(s => [s.id, s]))
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
      weight: v.weight ?? 50,
    })),
    transitions: (s.transitions || []).map(t => ({
      id: t.id,
      condition: t.condition as LocalTransition['condition'],
      next_step_order: t.next_step != null ? (stepById[t.next_step]?.order ?? null) : null,
      wait_days: t.wait_days,
      wait_hours: t.wait_hours,
    })),
  }))
}

const VARIANT_LETTERS = 'ABCDEFGHIJ'

function nextVariantLabel(variants: LocalVariant[]) {
  return VARIANT_LETTERS[variants.length] || String(variants.length + 1)
}

interface Props {
  campaign?: Campaign
  /** Pre-fills the name field when creating a fresh campaign (from the name modal). */
  initialName?: string
}

export function CampaignForm({ campaign, initialName }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [tab, setTab] = useState<'sequence' | 'leads' | 'schedule' | 'options'>('sequence')
  const [steps, setSteps] = useState<LocalStep[]>(
    toLocalSteps(campaign?.steps).length ? toLocalSteps(campaign?.steps) : [
      {
        order: 1, subject: '', html_content: '', text_content: '', delay_days: 0, delay_hours: 0,
        stop_on_open: false, stop_on_click: false,
        auto_optimize: false, auto_optimize_metric: 'reply_rate', auto_optimize_min_sends: 30,
        variants: [], transitions: [],
      },
    ]
  )
  const [deletedStepIds, setDeletedStepIds] = useState<number[]>([])
  const [deletedVariants, setDeletedVariants] = useState<{ stepId: number; variantId: number }[]>([])
  const [deletedTransitions, setDeletedTransitions] = useState<{ stepId: number; transitionId: number }[]>([])
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [subjectTagsOpen, setSubjectTagsOpen] = useState<string | null>(null)
  const subjectInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    if (!subjectTagsOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (!(target as Element).closest?.('[data-subject-tag-menu]')) setSubjectTagsOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [subjectTagsOpen])

  const insertSubjectTag = (key: string, tag: string, currentValue: string, setter: (v: string) => void) => {
    const el = subjectInputRefs.current.get(key)
    if (el) {
      const start = el.selectionStart ?? currentValue.length
      const end = el.selectionEnd ?? currentValue.length
      const next = currentValue.slice(0, start) + tag + currentValue.slice(end)
      setter(next)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(start + tag.length, start + tag.length)
      })
    } else {
      setter(currentValue + tag)
    }
    setSubjectTagsOpen(null)
  }
  // active variant tab per step index — undefined means "no variants / plain step"
  const [activeVarTab, setActiveVarTab] = useState<Record<number, number>>({})

  const { data: lists } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
    staleTime: 0,
  })

  const { data: smtpAccounts } = useQuery({
    queryKey: ['smtp-all'],
    queryFn: () => smtpApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
    staleTime: 0,
  })


  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: campaign?.name || initialName || '',
      reply_to: campaign?.reply_to || '',
      contact_list_ids: campaign?.contact_list_ids || [],
      smtp_account_ids: campaign?.smtp_account_ids || [],
      track_opens: campaign?.track_opens ?? false,
      track_clicks: campaign?.track_clicks ?? false,
      stop_on_reply: campaign?.stop_on_reply ?? true,
      daily_limit: campaign?.daily_limit ?? null,
      text_only: campaign?.text_only ?? false,
      schedule_enabled: campaign?.schedule_enabled ?? false,
      schedule_days: campaign?.schedule_days ?? [0, 1, 2, 3, 4],
      schedule_start_time: campaign?.schedule_start_time?.slice(0, 5) ?? '09:00',
      schedule_end_time: campaign?.schedule_end_time?.slice(0, 5) ?? '17:00',
      schedule_timezone: campaign?.schedule_timezone ?? 'UTC',
    },
  })

  const name = watch('name')
  const selectedLists = watch('contact_list_ids') || []
  const selectedSmtp = watch('smtp_account_ids') || []
  const trackOpens = watch('track_opens')
  const trackClicks = watch('track_clicks')
  const stopOnReply = watch('stop_on_reply')
  const dailyLimit = watch('daily_limit')
  const textOnly = watch('text_only')
  const scheduleEnabled = watch('schedule_enabled') ?? false
  const scheduleDays = watch('schedule_days') ?? [0, 1, 2, 3, 4]
  const scheduleStartTime = watch('schedule_start_time') ?? '09:00'
  const scheduleEndTime = watch('schedule_end_time') ?? '17:00'
  const scheduleTimezone = watch('schedule_timezone') ?? 'UTC'

  const selectedListObjs = (lists || []).filter((l: any) => selectedLists.includes(l.id))
  const totalContacts = selectedListObjs.reduce((sum: number, l: any) => sum + (l.contact_count || 0), 0)
  const selectedSmtpObjs = (smtpAccounts || []).filter((a: any) => selectedSmtp.includes(a.id))

  // Per-tab completeness — drives the progress indicators and gates activation.
  const stepIsFilled = (s: LocalStep) =>
    s.variants.length > 0
      ? s.variants.every(v => v.subject.trim() && v.html_content.trim())
      : Boolean(s.subject.trim() && s.html_content.trim())

  const detailsValid = Boolean((name || '').trim()) && selectedLists.length > 0 && selectedSmtp.length > 0
  const stepsValid = steps.length > 0 && steps.every(stepIsFilled)
  const leadsValid = selectedLists.length > 0
  const optionsValid = Boolean((name || '').trim()) && selectedSmtp.length > 0
  const canActivate = detailsValid && stepsValid

  const missing: string[] = []
  if (!(name || '').trim()) missing.push('campaign name')
  if (selectedSmtp.length === 0) missing.push('at least one sending account')
  if (selectedLists.length === 0) missing.push('at least one target list')
  if (steps.length === 0) missing.push('at least one step')
  else if (!steps.every(stepIsFilled)) missing.push('subject & body for every step/variant')
  const tabValid: Record<string, boolean> = {
    sequence: stepsValid, leads: leadsValid, schedule: true, options: optionsValid,
  }

  const toggleList = (id: number) => {
    setValue('contact_list_ids', selectedLists.includes(id)
      ? selectedLists.filter(x => x !== id)
      : [...selectedLists, id]
    )
  }

  const toggleSmtp = (id: number) => {
    setValue('smtp_account_ids', selectedSmtp.includes(id)
      ? selectedSmtp.filter(x => x !== id)
      : [...selectedSmtp, id]
    )
  }


  const addStep = () => {
    setSteps(prev => [...prev, {
      order: prev.length + 1, subject: '', html_content: '', text_content: '',
      delay_days: prev.length === 0 ? 0 : 3, delay_hours: 0,
      stop_on_open: false, stop_on_click: false,
      auto_optimize: false, auto_optimize_metric: 'reply_rate', auto_optimize_min_sends: 30,
      variants: [], transitions: [],
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
            { label: 'A', subject: s.subject, html_content: s.html_content, text_content: s.text_content, weight: 50 },
            { label: 'B', subject: '', html_content: '', text_content: '', weight: 50 },
          ],
        }
      }
      return { ...s, variants: [...s.variants, { label: nextVariantLabel(s.variants), subject: '', html_content: '', text_content: '', weight: 50 }] }
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
      if (deletedStepIds.includes(stepId)) continue
      await campaignsApi.deleteVariant(campaignId, stepId, variantId)
    }

    // First pass: save all steps and build order → saved stepId map (needed for transitions).
    const orderToStepId: Record<number, number> = {}
    const savedSteps: { local: LocalStep; savedId: number }[] = []
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
      const savedId = step.id
        ? (await campaignsApi.updateStep(campaignId, step.id, payload)).data.id
        : (await campaignsApi.createStep(campaignId, payload)).data.id
      orderToStepId[step.order] = savedId
      savedSteps.push({ local: step, savedId })
    }

    // Second pass: variants and transitions.
    for (const { local: step, savedId: stepId } of savedSteps) {
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

      // Transitions: delete removed, then create/update.
      for (const dt of deletedTransitions.filter(dt => dt.stepId === (step.id ?? stepId))) {
        await campaignsApi.deleteTransition(campaignId, stepId, dt.transitionId)
      }
      for (const tr of step.transitions) {
        const nextStepId = tr.next_step_order != null ? (orderToStepId[tr.next_step_order] ?? null) : null
        const payload = { condition: tr.condition, next_step: nextStepId, wait_days: tr.wait_days, wait_hours: tr.wait_hours }
        if (tr.id) {
          await campaignsApi.updateTransition(campaignId, stepId, tr.id, payload)
        } else {
          await campaignsApi.createTransition(campaignId, stepId, payload)
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
    <div className="flex flex-col h-full bg-background">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/campaigns')} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="font-semibold text-sm">{campaign ? 'Edit Campaign' : 'New Campaign'}</h1>
            <p className="text-xs text-muted-foreground">{name ? name : 'Untitled campaign'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!canActivate && (
            <p className="hidden md:block text-xs text-muted-foreground max-w-xs text-right leading-relaxed">
              Complete: {missing.join(', ')}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={handleSubmit(d => saveMut.mutate(d))} loading={saveMut.isPending}>
            <Save size={14} /> Save Draft
          </Button>
          <Button size="sm"
            onClick={handleSubmit(d => activateMut.mutate(d))}
            loading={activateMut.isPending}
            disabled={!canActivate}
            title={canActivate ? undefined : `Missing: ${missing.join(', ')}`}
          >
            <Play size={14} /> Activate
          </Button>
        </div>
      </div>

      {/* ── Tabs — Instantly style ── */}
      <div className="border-b bg-card px-6 shrink-0">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'sequence', label: 'Sequence', icon: Mail, badge: steps.length, dotClassName: tabValid.sequence ? 'bg-green-500' : 'bg-amber-400' },
            { key: 'leads', label: 'Leads', icon: Users, badge: selectedLists.length || undefined, dotClassName: tabValid.leads ? 'bg-green-500' : 'bg-amber-400' },
            { key: 'schedule', label: 'Schedule', icon: Clock, dotClassName: tabValid.schedule ? 'bg-green-500' : 'bg-amber-400' },
            { key: 'options', label: 'Options', icon: Settings2, dotClassName: tabValid.options ? 'bg-green-500' : 'bg-amber-400' },
          ]}
        />
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6 grid grid-cols-1 lg:grid-cols-[1fr_17rem] gap-6 items-start">
          <div className="min-w-0 space-y-4">

        {tab === 'options' && (
          <div className="space-y-4">

            {/* Campaign name */}
            <div className="rounded-xl border bg-card p-5 space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Name</Label>
              <Input {...register('name')} placeholder="e.g. Cold Outreach — SaaS Founders Q3" className="mt-1 text-sm h-10" />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
            </div>

            {/* Accounts to use */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Accounts to Send From <span className="text-destructive">*</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Selected accounts rotate equally per email. The From name & address come from each account.
                </p>
              </div>
              {errors.smtp_account_ids && (
                <p className="text-xs text-destructive">{errors.smtp_account_ids.message as string}</p>
              )}
              {(smtpAccounts || []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground">No SMTP accounts yet.</p>
                  <a href="/accounts" className="text-sm text-primary hover:underline">Add a sending account →</a>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {smtpAccounts.map((acc: any) => {
                    const selected = selectedSmtp.includes(acc.id)
                    return (
                      <label key={acc.id} className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-sm',
                        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                        !acc.is_active && 'opacity-60'
                      )}>
                        <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                          selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                        )}>
                          {selected && <Check size={10} className="text-primary-foreground" />}
                        </div>
                        <input type="checkbox" checked={selected} onChange={() => toggleSmtp(acc.id)} className="sr-only" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{acc.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{acc.from_email}</p>
                        </div>
                        {!acc.is_active && <span className="text-xs text-amber-600 shrink-0">inactive</span>}
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="pt-1">
                <Label className="text-xs">Reply-To <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input {...register('reply_to')} type="email" placeholder="replies@company.com" className="mt-1 h-9 text-sm" />
              </div>
            </div>

            {/* Tracking */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking & Behaviour</p>
              {[
                {
                  label: 'Open & click tracking',
                  desc: 'Recommended OFF for cold email — tracking pixels/links hurt deliverability and Apple Mail inflates opens',
                  checked: !!(trackOpens && trackClicks),
                  onChange: (v: boolean) => { setValue('track_opens', v); setValue('track_clicks', v) },
                },
                {
                  label: 'Stop on reply',
                  desc: 'Halt campaign as soon as a reply is detected',
                  checked: !!stopOnReply,
                  onChange: (v: boolean) => setValue('stop_on_reply', v),
                },
                {
                  label: 'Delivery optimization (text-only)',
                  desc: 'Send as plain text, no HTML — disables open/click tracking for this campaign, best deliverability',
                  checked: !!textOnly,
                  onChange: (v: boolean) => setValue('text_only', v),
                },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{row.desc}</p>
                  </div>
                  <Switch checked={row.checked} onCheckedChange={row.onChange} />
                </div>
              ))}
              <div className="pt-1 border-t">
                <Label className="text-xs">Daily Limit <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="number" min={1}
                  value={dailyLimit ?? ''}
                  onChange={e => setValue('daily_limit', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                  placeholder="Unlimited"
                  className="mt-1 h-9 text-sm max-w-[10rem]"
                />
                <p className="text-xs text-muted-foreground mt-1">Max emails to send per day for this campaign, across all sending accounts</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'leads' && (
          <div className="space-y-4">
            {/* Target lists */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Lists <span className="text-destructive">*</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Leads are enrolled automatically, including ones added later</p>
              </div>
              {errors.contact_list_ids && (
                <p className="text-xs text-destructive">{errors.contact_list_ids.message}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {lists?.map((list: any) => {
                  const selected = selectedLists.includes(list.id)
                  return (
                    <label key={list.id} className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-sm',
                      selected ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    )}>
                      <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                        selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      )}>
                        {selected && <Check size={10} className="text-primary-foreground" />}
                      </div>
                      <input type="checkbox" checked={selected} onChange={() => toggleList(list.id)} className="sr-only" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{list.name}</p>
                        <p className="text-xs text-muted-foreground">{list.contact_count?.toLocaleString()} leads</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'schedule' && (
          <div className="space-y-4">
            <SendingScheduleCard
              value={{ schedule_enabled: scheduleEnabled, schedule_days: scheduleDays, schedule_start_time: scheduleStartTime, schedule_end_time: scheduleEndTime, schedule_timezone: scheduleTimezone }}
              onChange={patch => { Object.entries(patch).forEach(([key, val]) => setValue(key as any, val as any)) }}
            />
          </div>
        )}

        {tab === 'sequence' && (
          <div className="space-y-4">
            {steps.map((step, index) => {
              const hasVariants = step.variants.length > 0
              const activeTab = activeVarTab[index] ?? 0
              const currentVariant = hasVariants ? step.variants[activeTab] : null

              // What subject/html to show in the editor area
              const editSubject = currentVariant ? currentVariant.subject : step.subject
              const editHtml    = currentVariant ? currentVariant.html_content : step.html_content

              const setSubject = (val: string) => currentVariant
                ? updateVariant(index, activeTab, { subject: val })
                : updateStep(index, { subject: val })
              const setBody = (html: string, text: string) => currentVariant
                ? updateVariant(index, activeTab, { html_content: html, text_content: text })
                : updateStep(index, { html_content: html, text_content: text })

              return (
                <Card key={step.id ?? `new-${index}`}>
                  {/* ── Step header ── */}
                  <CardHeader className="flex flex-row items-center justify-between pb-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Step {step.order}
                      {index > 0 && (
                        <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                          <Clock size={11} />
                          wait {step.delay_days}d {step.delay_hours}h
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
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive"
                        onClick={() => removeStep(index)} disabled={steps.length === 1}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </CardHeader>

                  {/* ── Variant tabs ── */}
                  <div className="flex items-center gap-1 px-4 pt-2 border-b">
                    {hasVariants ? (
                      <>
                        {step.variants.map((v, vi) => {
                          const isActive = activeTab === vi
                          return (
                            <div key={vi} role="tab"
                              onClick={() => setActiveVarTab(prev => ({ ...prev, [index]: vi }))}
                              className={cn(
                                'group relative flex items-center gap-2 px-3 py-2 rounded-t-lg border border-b-0 -mb-px cursor-pointer transition-all select-none min-w-0 max-w-[220px]',
                                isActive
                                  ? 'bg-background border-border text-foreground shadow-sm'
                                  : 'bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                              )}
                            >
                              <span className={cn(
                                'flex-none w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center',
                                isActive ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
                              )}>{v.label}</span>
                              <span className="truncate text-xs font-medium">
                                {v.subject || <span className="italic text-muted-foreground/60">No subject</span>}
                              </span>
                              {step.variants.length > 1 && (
                                <span role="button"
                                  onClick={e => { e.stopPropagation(); removeVariant(index, vi); setActiveVarTab(prev => ({ ...prev, [index]: Math.max(0, vi - 1) })) }}
                                  className="flex-none opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                                ><X size={10} /></span>
                              )}
                            </div>
                          )
                        })}
                        <button type="button"
                          onClick={() => { addVariant(index); setActiveVarTab(prev => ({ ...prev, [index]: step.variants.length })) }}
                          className="flex items-center gap-1 px-2 py-1.5 ml-1 text-xs text-muted-foreground hover:text-primary rounded-md hover:bg-muted transition-colors"
                        ><Plus size={11} /> Add Variant</button>
                      </>
                    ) : (
                      <button type="button"
                        onClick={() => { addVariant(index); setActiveVarTab(prev => ({ ...prev, [index]: 0 })) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 mb-1 text-xs font-medium border border-dashed rounded-md text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                      ><Plus size={11} /> Add A/B Variant</button>
                    )}
                  </div>

                  <CardContent className="pt-4 space-y-4">
                    {/* Subject */}
                    {(() => {
                      const key = `${index}-${activeTab}`
                      return (
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject *</Label>
                          <div className="flex gap-1.5 items-start mt-1.5">
                            <Input
                              ref={el => { if (el) subjectInputRefs.current.set(key, el); else subjectInputRefs.current.delete(key) }}
                              value={editSubject}
                              onChange={e => setSubject(e.target.value)}
                              placeholder="Quick question about {{company}}"
                              className="h-10 flex-1"
                            />
                            <div className="relative" data-subject-tag-menu>
                              <button
                                type="button"
                                onClick={() => setSubjectTagsOpen(v => v === key ? null : key)}
                                className="h-10 px-3 rounded-md border text-xs font-mono bg-muted/50 hover:bg-muted whitespace-nowrap flex items-center gap-1"
                                title="Insert personalization tag"
                              >
                                {'{{ }}'}
                              </button>
                              {subjectTagsOpen === key && (
                                <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-md border bg-popover shadow-md py-1 max-h-72 overflow-y-auto">
                                  <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                                  {SUBJECT_CONTACT_TAGS.map(t => (
                                    <button key={t.tag} type="button"
                                      onClick={() => insertSubjectTag(key, `{{${t.tag}}}`, editSubject, setSubject)}
                                      className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
                                    >
                                      <span>{t.label}</span>
                                      <span className="font-mono text-muted-foreground text-[10px]">{`{{${t.tag}}}`}</span>
                                    </button>
                                  ))}
                                  <div className="border-t my-1" />
                                  <p className="px-3 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sender</p>
                                  {SUBJECT_SENDER_TAGS.map(t => (
                                    <button key={t.tag} type="button"
                                      onClick={() => insertSubjectTag(key, `{{${t.tag}}}`, editSubject, setSubject)}
                                      className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
                                    >
                                      <span>{t.label}</span>
                                      <span className="font-mono text-muted-foreground text-[10px]">{`{{${t.tag}}}`}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Body</Label>
                        <button type="button" onClick={() => setPreview({ subject: editSubject, html: editHtml })}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <Eye size={12} /> Preview
                        </button>
                      </div>
                      <EmailBodyEditor value={editHtml} onChange={setBody} placeholder="Hi {{first_name}}, ..." />
                    </div>

                    {/* Distribution — weight each variant's share of sends */}
                    {step.variants.length > 1 && (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <FlaskConical size={14} /> Traffic Distribution
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Weight each variant's share of sends — equal by default, or bias toward a control
                          </p>
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            const totalWeight = step.variants.reduce((sum, v) => sum + Math.max(v.weight, 0), 0)
                            return step.variants.map((v, vi) => {
                              const pct = totalWeight > 0 ? Math.round((Math.max(v.weight, 0) / totalWeight) * 100) : 0
                              return (
                                <div key={vi} className="flex items-center gap-3">
                                  <span className="flex-none w-5 h-5 rounded-full bg-muted-foreground/20 text-[10px] font-bold flex items-center justify-center">
                                    {v.label}
                                  </span>
                                  <input
                                    type="range" min={0} max={100} value={Math.min(v.weight, 100)}
                                    onChange={e => updateVariant(index, vi, { weight: Number(e.target.value) })}
                                    className="flex-1 accent-primary"
                                  />
                                  <Input
                                    type="number" min={0} value={v.weight}
                                    onChange={e => updateVariant(index, vi, { weight: Math.max(0, Number(e.target.value)) })}
                                    className="w-16 h-8 text-xs"
                                  />
                                  <span className="w-10 text-right text-xs font-medium text-muted-foreground tabular-nums">{pct}%</span>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Auto-optimize */}
                    {step.variants.length > 1 && (
                      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Auto-optimize</p>
                            <p className="text-xs text-muted-foreground">Keep only the best-performing variant after enough sends</p>
                          </div>
                          <Switch checked={step.auto_optimize} onCheckedChange={v => updateStep(index, { auto_optimize: v })} />
                        </div>
                        {step.auto_optimize && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Winning Metric</Label>
                              <NativeSelect value={step.auto_optimize_metric}
                                onChange={e => updateStep(index, { auto_optimize_metric: e.target.value as LocalStep['auto_optimize_metric'] })}
                                wrapperClassName="mt-1 w-full">
                                <option value="open_rate">Open Rate</option>
                                <option value="click_rate">Click Rate</option>
                                <option value="reply_rate">Reply Rate</option>
                              </NativeSelect>
                            </div>
                            <div>
                              <Label className="text-xs">Min Sends per Variant</Label>
                              <Input type="number" min={1} value={step.auto_optimize_min_sends}
                                onChange={e => updateStep(index, { auto_optimize_min_sends: Number(e.target.value) })}
                                className="mt-1" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delay */}
                    {index > 0 && (
                      <div className="grid grid-cols-2 gap-3 pt-1 border-t">
                        <div>
                          <Label className="text-xs text-muted-foreground">Wait Days</Label>
                          <Input type="number" min={0} value={step.delay_days}
                            onChange={e => updateStep(index, { delay_days: Number(e.target.value) })} className="mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Wait Hours</Label>
                          <Input type="number" min={0} value={step.delay_hours}
                            onChange={e => updateStep(index, { delay_hours: Number(e.target.value) })} className="mt-1" />
                        </div>
                      </div>
                    )}

                    {/* Stop conditions */}
                    <div className="pt-1 border-t">
                      <div>
                        <p className="text-sm font-medium">Stop condition</p>
                        <p className="text-xs text-muted-foreground">
                          Skip remaining steps once this email is engaged with
                        </p>
                      </div>
                      <NativeSelect
                        value={step.stop_on_open ? 'opened' : step.stop_on_click ? 'clicked' : 'never'}
                        onChange={e => {
                          const v = e.target.value
                          updateStep(index, {
                            stop_on_open: v === 'opened',
                            stop_on_click: v === 'clicked',
                          })
                        }}
                        wrapperClassName="mt-2 w-full"
                      >
                        <option value="never">Never — always send every step</option>
                        <option value="opened">If opened (or clicked)</option>
                        <option value="clicked">If clicked only, not just opened</option>
                      </NativeSelect>
                    </div>

                    {/* Branching */}
                    <div className="space-y-3 pt-1 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5"><GitBranch size={14} /> Branching</p>
                          <p className="text-xs text-muted-foreground">Route leads to different steps based on engagement</p>
                        </div>
                        <Switch
                          checked={step.transitions.length > 0}
                          onCheckedChange={v => {
                            if (v) {
                              updateStep(index, {
                                transitions: [{ condition: 'opened', next_step_order: null, wait_days: 1, wait_hours: 0 }],
                              })
                            } else {
                              // Delete existing saved transitions
                              for (const tr of step.transitions) {
                                if (tr.id && step.id) setDeletedTransitions(d => [...d, { stepId: step.id!, transitionId: tr.id! }])
                              }
                              updateStep(index, { transitions: [] })
                            }
                          }}
                        />
                      </div>

                      {step.transitions.length > 0 && (
                        <div className="space-y-2 pl-1">
                          {step.transitions.map((tr, ti) => (
                            <div key={ti} className="flex items-center gap-2 flex-wrap">
                              <select
                                value={tr.condition}
                                onChange={e => updateStep(index, {
                                  transitions: step.transitions.map((t, i) =>
                                    i === ti ? { ...t, condition: e.target.value as LocalTransition['condition'] } : t
                                  ),
                                })}
                                className="text-xs border rounded px-2 py-1.5 bg-background"
                              >
                                <option value="opened">If opened</option>
                                <option value="not_opened">If not opened</option>
                                <option value="clicked">If clicked</option>
                                <option value="replied">If replied</option>
                                <option value="default">Always (default)</option>
                              </select>
                              <ArrowRight size={12} className="text-muted-foreground flex-none" />
                              <select
                                value={tr.next_step_order ?? ''}
                                onChange={e => updateStep(index, {
                                  transitions: step.transitions.map((t, i) =>
                                    i === ti ? { ...t, next_step_order: e.target.value === '' ? null : Number(e.target.value) } : t
                                  ),
                                })}
                                className="text-xs border rounded px-2 py-1.5 bg-background flex-1 min-w-0"
                              >
                                <option value="">End campaign</option>
                                {steps
                                  .filter(s => s.order !== step.order)
                                  .map(s => (
                                    <option key={s.order} value={s.order}>
                                      Step {s.order}{s.subject ? `: ${s.subject.slice(0, 30)}` : ''}
                                    </option>
                                  ))}
                              </select>
                              <span className="text-xs text-muted-foreground flex-none">after</span>
                              <input
                                type="number" min={0} value={tr.wait_days}
                                onChange={e => updateStep(index, {
                                  transitions: step.transitions.map((t, i) =>
                                    i === ti ? { ...t, wait_days: Number(e.target.value) } : t
                                  ),
                                })}
                                className="text-xs border rounded px-2 py-1.5 w-14 bg-background"
                              />
                              <span className="text-xs text-muted-foreground flex-none">days</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (tr.id && step.id) setDeletedTransitions(d => [...d, { stepId: step.id!, transitionId: tr.id! }])
                                  updateStep(index, { transitions: step.transitions.filter((_, i) => i !== ti) })
                                }}
                                className="text-muted-foreground hover:text-destructive flex-none"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateStep(index, {
                              transitions: [
                                ...step.transitions,
                                { condition: 'not_opened', next_step_order: null, wait_days: 3, wait_hours: 0 },
                              ],
                            })}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus size={12} /> Add condition
                          </button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {/* Add Step */}
            <button type="button" onClick={addStep}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
              <Plus size={15} /> Add Step
            </button>
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
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><Mail size={12} /> Sending Accounts</p>
                  {selectedSmtpObjs.length ? (
                    <>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {selectedSmtpObjs.map((a: any) => (
                          <span key={a.id} className="text-xs rounded-full bg-muted px-2 py-0.5 truncate max-w-full">{a.name}</span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedSmtpObjs.length} account(s) · rotate equally</p>
                    </>
                  ) : (
                    <p className="text-xs text-destructive">No sending accounts selected</p>
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
                      <p className="text-xs text-muted-foreground">{totalContacts.toLocaleString()} leads enrolled</p>
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

      {/* Email preview panel — uses the logged-in user's own profile as sample data */}
      {preview && (() => {
        // Sample CONTACT data — not the sender's profile.
        const sampleMap: [string, string][] = [
          ['first_name',      'Sarah'],
          ['last_name',       'Johnson'],
          ['full_name',       'Sarah Johnson'],
          ['company',         'Stripe'],
          ['title',           'Head of Growth'],
          ['email',           'sarah@stripe.com'],
          ['phone',           '+1 555 0192'],
          ['website',         'stripe.com'],
          ['city',            'San Francisco'],
          ['state',           'CA'],
          ['country',         'USA'],
          // Sender tags: use the first selected sending account, else fall back to logged-in user profile.
          ['sender_name',    selectedSmtpObjs[0]?.from_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Your Name'],
          ['sender_email',   selectedSmtpObjs[0]?.from_email || user?.email || 'you@example.com'],
          ['sender_company', user?.company_name || 'Your Company'],
        ]
        // Mirrors the backend spin() — picks one option at random from {a|b|c}.
        // Run AFTER merge-tag substitution so {{tags}} are already gone.
        const spin = (str: string) =>
          str.replace(/\{([^{}]+)\}/g, (_, inner) => {
            const opts = inner.split('|')
            return opts[Math.floor(Math.random() * opts.length)]
          })
        const applyVars = (str: string) =>
          spin(sampleMap.reduce((s, [tag, val]) => s.replace(new RegExp(`\\{\\{${tag}\\}\\}`, 'g'), val), str))

        return (
          <div className="fixed inset-0 z-50 flex" onClick={() => setPreview(null)}>
            <div className="flex-1 bg-black/50 backdrop-blur-sm" />
            <div
              className="w-full max-w-2xl h-full bg-card border-l flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
                <div>
                  <p className="font-semibold text-sm">Email Preview</p>
                  {preview.subject && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium">Subject:</span> {applyVars(preview.subject)}
                    </p>
                  )}
                </div>
                <button onClick={() => setPreview(null)} className="p-1.5 rounded hover:bg-muted">
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 py-2.5 bg-muted/40 border-b shrink-0 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sample recipient data (not your profile)
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(['first_name', 'company', 'title', 'sender_name'] as const).map(tag => {
                    const entry = sampleMap.find(([t]) => t === tag)
                    if (!entry) return null
                    return (
                      <span key={tag} className="text-[11px] text-muted-foreground">
                        <span className="font-mono bg-muted px-1 rounded">{`{{${tag}}}`}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium text-foreground">{entry[1]}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100">
                <iframe
                  srcDoc={`<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;line-height:1.6;padding:24px;max-width:600px;margin:0 auto">${
                    applyVars(preview.html || '<p style="color:#888">No content yet.</p>')
                  }</body></html>`}
                  className="w-full h-full border-none"
                  title="Email preview"
                />
              </div>
            </div>
          </div>
        )
      })()}
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
