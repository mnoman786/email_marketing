export interface User {
  id: number
  email: string
  username: string
  first_name: string
  last_name: string
  company_name: string
  timezone: string
  is_email_verified: boolean
  apollo_api_key: string
  created_at: string
}

export interface UserSession {
  id: number
  device: string
  ip_address: string | null
  created_at: string
  last_active_at: string
  is_current: boolean
}

export interface ContactList {
  id: number
  name: string
  description: string
  contact_count: number
  total_contacts: number
  created_at: string
  updated_at: string
}

export interface VerificationDetail {
  sub_status?: string
  score?: number
  spam_score?: number         // 0–100 send risk (higher = spammier/riskier)
  risk?: 'low' | 'medium' | 'high'
  is_disposable?: boolean
  is_role?: boolean
  is_free?: boolean
  is_gibberish?: boolean
  suggestion?: string
  normalized?: string
}

// Per-bucket verification counts for the list-detail tabs (from /api/contacts/stats/).
export interface VerificationStats {
  total: number
  valid: number
  risky: number
  invalid: number
  disposable: number
  unknown: number
  unverified: number
}

// --- Import validation (staging) ---
export type VerificationBucket = 'valid' | 'risky' | 'invalid' | 'disposable' | 'unknown' | 'unverified'

export interface ImportBatch {
  id: number
  name: string
  status: 'verifying' | 'ready' | 'promoted'
  total: number
  verified_count: number
  promoted_count: number
  percent: number
  counts: Partial<Record<VerificationBucket | 'total', number>>
  created_at: string
  updated_at: string
}

export interface StagedLead {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  company: string
  verification_status: 'unverified' | 'valid' | 'invalid' | 'unknown'
  verification_detail: VerificationDetail
  promoted: boolean
}

export interface DeliverabilityCheck {
  found: boolean
  record?: string | null
  issues?: string[]
}

export interface DeliverabilityResult {
  domain: string
  spf: DeliverabilityCheck
  dmarc: DeliverabilityCheck & { policy: string | null }
  dkim: DeliverabilityCheck & { selector: string | null; checked_selectors: string[] }
}

export interface Tag {
  id: number
  name: string
  color: string
  contact_count: number
  created_at: string
}

export interface Contact {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  company: string
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
  verification_status: 'unverified' | 'valid' | 'invalid' | 'unknown'
  verification_detail: VerificationDetail
  verified_at: string | null
  custom_fields: Record<string, any>
  full_name: string
  list_ids: number[]
  list_names: { id: number; name: string }[]
  tag_ids: number[]
  tags_detail: { id: number; name: string; color: string }[]
  subscribed_at: string
  unsubscribed_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  preview_text: string
  html_content: string
  text_content: string
  variables: string[]
  is_active: boolean
  created_at: string
  updated_at: string
  preview_html?: string
}

export interface SMTPAccount {
  id: number
  name: string
  host: string
  port: number
  username: string
  has_password: boolean
  from_email: string
  from_name: string
  security: 'none' | 'tls' | 'ssl'
  is_active: boolean
  daily_limit: number
  hourly_limit: number
  last_tested_at: string | null
  last_test_success: boolean | null
  imap_enabled: boolean
  imap_host: string
  imap_port: number
  imap_username: string
  has_imap_password: boolean
  imap_use_ssl: boolean
  capture_cold_leads: boolean
  last_imap_checked_at: string | null
  last_imap_tested_at: string | null
  last_imap_test_success: boolean | null
  signature_html: string
  created_at: string
  updated_at: string
}


export interface StepTransition {
  id: number
  step: number
  condition: 'opened' | 'not_opened' | 'clicked' | 'replied' | 'default'
  next_step: number | null
  wait_days: number
  wait_hours: number
}

export interface CampaignStepVariant {
  id: number
  step: number
  label: string
  subject: string
  html_content: string
  text_content: string
  is_active: boolean
}

export interface CampaignStep {
  id: number
  campaign: number
  order: number
  subject: string
  template: number | null
  html_content: string
  text_content: string
  campaign_variables: Record<string, string>
  delay_days: number
  delay_hours: number
  stop_on_open: boolean
  stop_on_click: boolean
  auto_optimize: boolean
  auto_optimize_metric: 'open_rate' | 'click_rate' | 'reply_rate'
  auto_optimize_min_sends: number
  variants: CampaignStepVariant[]
  transitions: StepTransition[]
}

export interface CampaignSmtpRef {
  id: number
  name: string
  from_email: string
  is_active: boolean
}

export interface Campaign {
  id: number
  name: string
  contact_list_ids: number[]
  contact_lists_detail: ContactList[]
  smtp_account_ids: number[]
  smtp_accounts_detail: CampaignSmtpRef[]
  from_name: string
  from_email: string
  reply_to: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  track_opens: boolean
  track_clicks: boolean
  stop_on_reply: boolean
  schedule_enabled: boolean
  schedule_days: number[]
  schedule_start_time: string
  schedule_end_time: string
  schedule_timezone: string
  steps: CampaignStep[]
  created_at: string
  updated_at: string
}

export interface CampaignListItem {
  id: number
  name: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  contact_list_count: number
  step_count: number
  enrollment_count: number
  sent: number
  opened: number
  clicked: number
  replied: number
  created_at: string
}

export interface CampaignEnrollment {
  id: number
  contact: number
  contact_email: string
  contact_name: string
  current_step_order: number | null
  status: 'active' | 'completed' | 'stopped' | 'unsubscribed' | 'bounced'
  next_send_at: string | null
  enrolled_at: string
  completed_at: string | null
}

export interface SendLog {
  id: number
  campaign: number
  campaign_name: string
  contact: number | null
  contact_email: string
  contact_name: string
  smtp_account: number | null
  smtp_name: string
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked' | 'unsubscribed' | 'replied'
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  error_message: string
  created_at: string
}

export interface DashboardStats {
  contacts: { total: number; active: number; lists: number }
  campaigns: { total: number; active: number; statuses: { status: string; count: number }[] }
  emails: {
    total_sent: number
    total_failed: number
    total_opened: number
    recent_sent_30d: number
    recent_failed_30d: number
    open_rate: number
    delivery_rate: number
  }
  smtp_accounts: number
  trend: { date: string; sent: number; failed: number }[]
  smtp_performance: { id: number; name: string; sent: number; failed: number }[]
}

export interface InboxAttachment {
  id: number
  filename: string
  content_type: string
  size: number
  url: string
}

export interface InboxMessage {
  id: number
  direction: 'inbound' | 'outbound'
  from_email: string
  to_email: string
  subject: string
  body_html: string
  body_text: string
  occurred_at: string
  attachments: InboxAttachment[]
}

export interface Thread {
  id: number
  contact: number
  contact_email: string
  contact_name: string
  smtp_account: number
  smtp_account_name: string
  subject: string
  last_message_at: string | null
  last_message_direction: 'inbound' | 'outbound' | ''
  is_unread: boolean
  is_archived: boolean
  is_cold_lead: boolean
  lead_status: 'none' | 'interested' | 'not_interested' | 'meeting_booked'
  lead_status_auto: boolean
  snoozed_until: string | null
  created_at: string
}

export interface ReplyTemplate {
  id: number
  name: string
  body_html: string
  body_text: string
  created_at: string
}

export interface ContactStats {
  total_sent: number
  opened: number
  clicked: number
  replied: number
  bounced: number
  campaigns: string[]
}

export interface ThreadListItem extends Thread {
  last_message_preview: string
}

export interface ThreadDetail extends Thread {
  messages: InboxMessage[]
}

export interface PaginatedResponse<T> {
  count: number
  items: T[]
  next?: string | null
}

export type WorkflowTriggerType =
  | 'opened' | 'clicked' | 'replied' | 'bounced' | 'added_to_list' | 'no_reply_after'

export type WorkflowActionType =
  | 'add_to_list' | 'remove_from_list' | 'start_sequence' | 'stop_sequence'
  | 'update_contact_status' | 'webhook'

export type WorkflowNodeType = 'trigger' | 'condition' | 'action' | 'end'

export interface WorkflowNode {
  id: number
  node_type: WorkflowNodeType
  config: Record<string, any>
  position_x: number
  position_y: number
}

export interface WorkflowEdge {
  id: number
  source_node: number
  target_node: number
  label: string
}

export interface WorkflowListItem {
  id: number
  name: string
  is_active: boolean
  node_count: number
  run_count: number
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: number
  name: string
  is_active: boolean
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  run_count: number
  created_at: string
  updated_at: string
}

export interface WorkflowRun {
  id: number
  contact_id: number
  contact_email: string
  dedup_key: string
  trigger_context: Record<string, any>
  ran_at: string
}
