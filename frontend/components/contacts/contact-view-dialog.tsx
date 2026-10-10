'use client'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Contact } from '@/lib/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { VerificationDot, SpamRiskBadge, SUB_STATUS_LABEL } from '@/components/contacts/verification-badges'
import { getTagBadgeProps } from './tag-form-dialog'
import { formatDateTime, cn } from '@/lib/utils'
import { UserRound, Pencil, Mail, Phone, Building2, ListFilter, Tag as TagIcon, Calendar, Globe, Briefcase, MapPin, Link2, Flag, CalendarClock, StickyNote } from 'lucide-react'

const STAGE_LABELS: Record<Contact['lead_stage'], string> = {
  new: 'New', contacted: 'Contacted', replied: 'Replied',
  qualified: 'Qualified', won: 'Won', lost: 'Lost',
}

interface Props {
  open: boolean
  onClose: () => void
  contact: Contact | null
  onEdit: () => void
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  )
}

export function ContactViewDialog({ open, onClose, contact, onEdit }: Props) {
  if (!contact) return null

  const initials = `${contact.first_name?.[0] || ''}${contact.last_name?.[0] || ''}`.toUpperCase() || contact.email[0].toUpperCase()
  const d = contact.verification_detail || {}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-5 border-b bg-muted/30">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-semibold leading-tight truncate">
              {contact.full_name || contact.email}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-0 flex items-center gap-1.5">
              <VerificationDot contact={contact} />
              {contact.email}
            </DialogDescription>
          </div>
          <StatusBadge status={contact.status} />
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[62vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field icon={Phone} label="Phone" value={contact.phone || '—'} />
            <Field icon={Building2} label="Company" value={contact.company || '—'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field icon={Flag} label="Lead stage" value={STAGE_LABELS[contact.lead_stage || 'new']} />
            <Field icon={CalendarClock} label="Next follow-up" value={contact.next_follow_up_at || '—'} />
          </div>

          {(contact.title || contact.industry || contact.company_size || contact.lead_source) && (
            <div className="grid grid-cols-2 gap-4">
              {contact.title && <Field icon={Briefcase} label="Job title" value={contact.title} />}
              {contact.industry && <Field icon={Building2} label="Industry" value={contact.industry} />}
              {contact.company_size && <Field icon={UserRound} label="Company size" value={contact.company_size} />}
              {contact.lead_source && <Field icon={Flag} label="Lead source" value={contact.lead_source} />}
            </div>
          )}

          {(contact.website || contact.linkedin_url || contact.city || contact.state || contact.country) && (
            <div className="grid grid-cols-2 gap-4">
              {contact.website && <Field icon={Globe} label="Website" value={/^https?:\/\//i.test(contact.website) ? <a href={contact.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{contact.website}</a> : contact.website} />}
              {contact.linkedin_url && <Field icon={Link2} label="LinkedIn" value={/^https?:\/\//i.test(contact.linkedin_url) ? <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View profile</a> : contact.linkedin_url} />}
              {(contact.city || contact.state || contact.country) && <Field icon={MapPin} label="Location" value={[contact.city, contact.state, contact.country].filter(Boolean).join(', ')} />}
            </div>
          )}

          {contact.notes && (
            <div className="rounded-lg border p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><StickyNote size={12} /> Notes</p>
              <p className="whitespace-pre-wrap break-words text-sm">{contact.notes}</p>
            </div>
          )}

          {Object.keys(contact.custom_fields || {}).length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(contact.custom_fields).map(([key, value]) => (
                <Field key={key} icon={ListFilter} label={key} value={String(value ?? '—')} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field
              icon={Mail}
              label="Email verification"
              value={
                d.sub_status && SUB_STATUS_LABEL[d.sub_status]
                  ? SUB_STATUS_LABEL[d.sub_status]
                  : contact.verification_status === 'unverified' ? 'Not yet verified' : contact.verification_status
              }
            />
            <Field icon={UserRound} label="Spam risk" value={<SpamRiskBadge contact={contact} />} />
          </div>

          {contact.list_names.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <ListFilter size={12} /> Lists
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contact.list_names.map(l => (
                  <span key={l.id} className="badge bg-muted text-muted-foreground text-xs">{l.name}</span>
                ))}
              </div>
            </div>
          )}

          {contact.tags_detail.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <TagIcon size={12} /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags_detail.map(t => {
                  const badge = getTagBadgeProps(t.color)
                  return (
                    <span key={t.id} className={cn('text-xs', badge.className)} style={badge.style}>
                      {t.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t">
            <Calendar size={12} />
            Added {formatDateTime(contact.created_at)}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onEdit}>
            <Pencil size={14} /> Edit Lead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
