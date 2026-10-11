'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { Contact } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog'
import { VerificationDot, SpamRiskBadge, SUB_STATUS_LABEL } from '@/components/contacts/verification-badges'
import { getTagBadgeProps } from '@/components/contacts/tag-form-dialog'
import { formatDateTime, cn } from '@/lib/utils'
import { useState } from 'react'
import { ArrowLeft, Pencil, Mail, Phone, Building2, Globe, Link2, MapPin, CalendarClock, BriefcaseBusiness, Tag, ListFilter, Activity, ExternalLink, StickyNote, ShieldCheck, UserRound } from 'lucide-react'
import Link from 'next/link'

interface LeadActivity {
  campaigns: { id: number; name: string; status: string; current_step: number | null; next_send_at: string | null; enrolled_at: string }[]
  events: { id: number; campaign_id: number; campaign_name: string; step: number | null; status: string; sent_at: string | null; opened_at: string | null; clicked_at: string | null; replied_at: string | null; created_at: string }[]
}

function Detail({ label, value, icon: Icon }: { label: string; value?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon size={13} />}{label}
      </div>
      <div className="break-words text-sm font-medium">{value || '—'}</div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Icon size={18} className="text-primary" />{title}</h2>
      {children}
    </section>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const leadId = Number(id)
  const { data: lead, isLoading, isError, refetch } = useQuery({
    queryKey: ['contact', leadId],
    queryFn: () => contactsApi.get(leadId).then(response => response.data as Contact),
    enabled: Number.isInteger(leadId) && leadId > 0,
  })
  const { data: activity } = useQuery({
    queryKey: ['contact-activity', leadId],
    queryFn: () => contactsApi.activity(leadId).then(response => response.data as LeadActivity),
    enabled: !!lead,
  })

  if (isLoading) return <PageSkeleton />
  if (!lead || isError) return <ErrorState title="Lead not found" description="This lead may have been removed, or you may not have access to it." onRetry={() => refetch()} />

  const name = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const initials = [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join('').toUpperCase() || lead.email[0].toUpperCase()
  const verification = lead.verification_detail?.sub_status && SUB_STATUS_LABEL[lead.verification_detail.sub_status]
    ? SUB_STATUS_LABEL[lead.verification_detail.sub_status]
    : lead.verification_status === 'unverified' ? 'Not yet verified' : lead.verification_status

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-6">
      <button type="button" onClick={() => router.push('/leads')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> Back to leads</button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-background p-5 shadow-sm sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">{initials}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-bold">{name}</h1><StatusBadge status={lead.status} /></div>
            <p className="mt-1 flex items-center gap-2 break-all text-sm text-muted-foreground"><VerificationDot contact={lead} />{lead.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">Added {formatDateTime(lead.created_at)} · Updated {formatDateTime(lead.updated_at)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.location.href = `mailto:${lead.email}`}><Mail size={15} /> Email</Button>
          <Button onClick={() => setEditing(true)}><Pencil size={15} /> Edit lead</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Section title="Contact details" icon={UserRound}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="First name" value={lead.first_name} />
              <Detail label="Last name" value={lead.last_name} />
              <Detail label="Phone" icon={Phone} value={lead.phone ? <a href={`tel:${lead.phone}`} className="text-primary hover:underline">{lead.phone}</a> : undefined} />
              <Detail label="Company" icon={Building2} value={lead.company} />
              <Detail label="Job title" icon={BriefcaseBusiness} value={lead.title} />
              <Detail label="Industry" value={lead.industry} />
              <Detail label="Company size" value={lead.company_size} />
              <Detail label="Lead source" value={lead.lead_source} />
              <Detail label="Location" icon={MapPin} value={[lead.city, lead.state, lead.country].filter(Boolean).join(', ')} />
              <Detail label="Website" icon={Globe} value={lead.website ? <a href={lead.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{lead.website}<ExternalLink size={12} /></a> : undefined} />
              <Detail label="LinkedIn" icon={Link2} value={lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">View profile<ExternalLink size={12} /></a> : undefined} />
            </div>
          </Section>

          <Section title="Notes and custom details" icon={StickyNote}>
            <p className="min-h-14 whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-4 text-sm">{lead.notes || 'No notes added yet.'}</p>
            {Object.keys(lead.custom_fields || {}).length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(lead.custom_fields).map(([key, value]) => <Detail key={key} label={key} value={String(value ?? '—')} />)}
              </div>
            )}
          </Section>

          <Section title="Campaign activity" icon={Activity}>
            {activity?.events.length ? (
              <div className="divide-y">
                {activity.events.map(event => (
                  <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div><p className="font-medium capitalize">Email {event.status}{event.step ? ` · Step ${event.step}` : ''}</p><p className="text-xs text-muted-foreground">{event.campaign_name || 'Campaign'}</p></div>
                    <time className="text-xs text-muted-foreground">{formatDateTime(event.sent_at || event.created_at)}</time>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No campaign email activity yet.</p>}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Lead status" icon={ShieldCheck}>
            <div className="space-y-3">
              <Detail label="Stage" value={<span className="capitalize">{lead.lead_stage}</span>} />
              <Detail label="Next follow-up" icon={CalendarClock} value={lead.next_follow_up_at || undefined} />
              <Detail label="Email verification" value={verification} />
              <Detail label="Spam risk" value={<SpamRiskBadge contact={lead} />} />
            </div>
          </Section>

          <Section title="Lists and tags" icon={ListFilter}>
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ListFilter size={13} /> Lists</p>
            <div className="mb-5 flex flex-wrap gap-1.5">{lead.list_names.length ? lead.list_names.map(list => <span key={list.id} className="badge bg-muted text-muted-foreground">{list.name}</span>) : <span className="text-sm text-muted-foreground">No lists</span>}</div>
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Tag size={13} /> Tags</p>
            <div className="flex flex-wrap gap-1.5">{lead.tags_detail.length ? lead.tags_detail.map(tag => {
              const badge = getTagBadgeProps(tag.color)
              return <span key={tag.id} className={cn(badge.className)} style={badge.style}>{tag.name}</span>
            }) : <span className="text-sm text-muted-foreground">No tags</span>}</div>
          </Section>

          <Section title="Campaigns" icon={Activity}>
            {activity?.campaigns.length ? activity.campaigns.map(campaign => (
              <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="block rounded-lg border p-3 hover:border-primary/40 hover:bg-primary/5">
                <p className="text-sm font-medium">{campaign.name}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{campaign.status}{campaign.current_step ? ` · Step ${campaign.current_step}` : ''}</p>
              </Link>
            )) : <p className="text-sm text-muted-foreground">Not in a campaign yet.</p>}
          </Section>
        </aside>
      </div>

      <ContactFormDialog open={editing} onClose={() => setEditing(false)} contact={lead} onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ['contact', leadId] })
        queryClient.invalidateQueries({ queryKey: ['contacts'] })
        setEditing(false)
      }} />
    </div>
  )
}
