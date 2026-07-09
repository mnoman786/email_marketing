'use client'
import { Contact, VerificationDetail } from '@/lib/types'

// A row that carries verification info — Contact or a StagedLead both qualify.
type Verifiable = {
  verification_status: string
  verification_detail?: VerificationDetail | null
}

// Small coloured dot conveying email-verification status at a glance.
export const VERIFY_META: Record<string, { color: string; title: string }> = {
  valid: { color: 'bg-green-500', title: 'Email verified — domain accepts mail' },
  invalid: { color: 'bg-red-500', title: 'Invalid — bad address or no mail server' },
  unknown: { color: 'bg-amber-400', title: 'Unverified — lookup was inconclusive' },
  unverified: { color: 'bg-gray-300', title: 'Not yet verified' },
}

// Human-readable labels for the verifier's sub_status.
export const SUB_STATUS_LABEL: Record<string, string> = {
  ok: 'Deliverable',
  invalid_syntax: 'Invalid format',
  disposable: 'Disposable / temp address',
  no_mx: 'Domain has no mail server',
  mx_lookup_failed: 'DNS lookup inconclusive',
  possible_typo: 'Possible typo',
  role_account: 'Role-based mailbox',
  gibberish: 'Gibberish / random address',
  mailbox_not_found: 'Mailbox does not exist',
  accept_all: 'Catch-all domain',
}

export function VerificationDot({ contact }: { contact: Verifiable }) {
  const m = VERIFY_META[contact.verification_status] || VERIFY_META.unverified
  const d = contact.verification_detail || {}
  const parts = [m.title]
  if (d.sub_status && SUB_STATUS_LABEL[d.sub_status]) parts.push(SUB_STATUS_LABEL[d.sub_status])
  if (typeof d.score === 'number') parts.push(`Score ${d.score}/10`)
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${m.color}`} title={parts.join(' · ')} />
}

// Per-lead spam / send-risk badge derived from verification_detail.
export const RISK_META: Record<string, { color: string; label: string }> = {
  low: { color: 'bg-green-100 text-green-700', label: 'Low' },
  medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
  high: { color: 'bg-red-100 text-red-700', label: 'High' },
}

export function SpamRiskBadge({ contact }: { contact: Verifiable }) {
  const d = contact.verification_detail || {}
  if (typeof d.spam_score !== 'number' || !d.risk) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  const m = RISK_META[d.risk] || RISK_META.low
  return (
    <span
      className={`badge ${m.color} text-xs`}
      title={`Spam risk ${d.spam_score}/100 — higher means more likely to hurt sender reputation`}
    >
      {m.label} · {d.spam_score}
    </span>
  )
}
