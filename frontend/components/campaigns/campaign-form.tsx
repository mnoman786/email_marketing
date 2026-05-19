'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { campaignsApi, listsApi, templatesApi, smtpApi } from '@/lib/api'
import { Campaign } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Save, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  subject: z.string().min(1, 'Subject required'),
  preview_text: z.string().optional(),
  from_name: z.string().optional(),
  from_email: z.string().email().optional().or(z.literal('')),
  reply_to: z.string().email().optional().or(z.literal('')),
  contact_list_ids: z.array(z.number()).min(1, 'Select at least one list'),
  template: z.number().nullable().optional(),
  html_content: z.string().optional(),
  track_opens: z.boolean().optional(),
  track_clicks: z.boolean().optional(),
  use_custom_smtp_routing: z.boolean().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  campaign?: Campaign
}

export function CampaignForm({ campaign }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'details' | 'content' | 'smtp'>('details')
  const [htmlContent, setHtmlContent] = useState(campaign?.html_content || '')
  const [smtpRoutes, setSmtpRoutes] = useState<{ smtp_account: number; weight: number }[]>([])

  const { data: lists } = useQuery({
    queryKey: ['lists-all'],
    queryFn: () => listsApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const { data: templates } = useQuery({
    queryKey: ['templates-all'],
    queryFn: () => templatesApi.getAll({ page_size: 100 }).then(r => r.data.items || []),
  })

  const { data: smtpAccounts } = useQuery({
    queryKey: ['smtp-accounts'],
    queryFn: () => smtpApi.getAll().then(r => r.data.items || []),
  })

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: campaign?.name || '',
      subject: campaign?.subject || '',
      preview_text: campaign?.preview_text || '',
      from_name: campaign?.from_name || '',
      from_email: campaign?.from_email || '',
      reply_to: campaign?.reply_to || '',
      contact_list_ids: campaign?.contact_list_ids || [],
      template: campaign?.template || null,
      track_opens: campaign?.track_opens ?? true,
      track_clicks: campaign?.track_clicks ?? true,
      use_custom_smtp_routing: campaign?.use_custom_smtp_routing ?? false,
    },
  })

  const selectedLists = watch('contact_list_ids') || []
  const selectedTemplate = watch('template')
  const trackOpens = watch('track_opens')
  const trackClicks = watch('track_clicks')
  const useCustomSMTP = watch('use_custom_smtp_routing')

  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t: any) => t.id === selectedTemplate)
      if (tpl) {
        setValue('subject', tpl.subject)
      }
    }
  }, [selectedTemplate, templates, setValue])

  const saveMut = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, html_content: htmlContent }
      const res = campaign
        ? await campaignsApi.update(campaign.id, payload)
        : await campaignsApi.create(payload)

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

  const sendMut = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, html_content: htmlContent }
      const res = campaign
        ? await campaignsApi.update(campaign.id, payload)
        : await campaignsApi.create(payload)
      await campaignsApi.send(res.data.id)
      return res.data
    },
    onSuccess: (data) => {
      toast.success('Campaign sending started!')
      router.push(`/campaigns/${data.id}`)
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
  })

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/campaigns')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="font-semibold">{campaign ? 'Edit Campaign' : 'New Campaign'}</h1>
            <p className="text-xs text-muted-foreground">Configure and send your campaign</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSubmit(d => saveMut.mutate(d))} loading={saveMut.isPending}>
            <Save size={15} /> Save Draft
          </Button>
          <Button onClick={handleSubmit(d => sendMut.mutate(d))} loading={sendMut.isPending}>
            <Send size={15} /> Save & Send
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-card px-6">
        {[
          { key: 'details', label: 'Details' },
          { key: 'content', label: 'Content' },
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
                  <Input {...register('name')} placeholder="Summer Sale Newsletter" className="mt-1" />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <Label>Email Subject *</Label>
                  <Input {...register('subject')} placeholder="Your exclusive summer offer 🌟" className="mt-1" />
                  {errors.subject && <p className="text-xs text-destructive mt-1">{errors.subject.message}</p>}
                </div>
                <div>
                  <Label>Preview Text</Label>
                  <Input {...register('preview_text')} placeholder="Short preview shown in inbox..." className="mt-1" />
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
                    <p className="text-xs text-muted-foreground">Track when recipients open your email</p>
                  </div>
                  <Switch checked={trackOpens} onCheckedChange={v => setValue('track_opens', v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Track Clicks</Label>
                    <p className="text-xs text-muted-foreground">Track link clicks in your email</p>
                  </div>
                  <Switch checked={trackClicks} onCheckedChange={v => setValue('track_clicks', v)} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'content' && (
          <div className="max-w-2xl space-y-5">
            <Card>
              <CardHeader><CardTitle className="text-sm">Use a Template</CardTitle></CardHeader>
              <CardContent>
                <select
                  value={selectedTemplate || ''}
                  onChange={e => setValue('template', e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                >
                  <option value="">Custom HTML (no template)</option>
                  {templates?.map((tpl: any) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                  ))}
                </select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Template content will be used. You can override the HTML below.
                  </p>
                )}
              </CardContent>
            </Card>

            {!selectedTemplate && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Custom HTML Content</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={htmlContent}
                    onChange={e => setHtmlContent(e.target.value)}
                    placeholder="<html>...</html>"
                    className="font-mono text-xs h-64"
                  />
                </CardContent>
              </Card>
            )}
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
