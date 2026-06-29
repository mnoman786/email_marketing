export interface User {
  id: number
  email: string
  username: string
  first_name: string
  last_name: string
  company_name: string
  timezone: string
  is_email_verified: boolean
  created_at: string
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

export interface Contact {
  id: number
  email: string
  first_name: string
  last_name: string
  phone: string
  company: string
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained'
  custom_fields: Record<string, any>
  full_name: string
  list_ids: number[]
  list_names: { id: number; name: string }[]
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
  weight: number
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
  last_imap_checked_at: string | null
  last_imap_tested_at: string | null
  last_imap_test_success: boolean | null
  created_at: string
  updated_at: string
}

export interface CampaignSMTPRoute {
  id: number
  smtp_account: number
  smtp_name: string
  smtp_from_email: string
  weight: number
  is_active: boolean
}

export interface Campaign {
  id: number
  name: string
  subject: string
  preview_text: string
  template: number | null
  template_detail: EmailTemplate | null
  contact_list_ids: number[]
  contact_lists_detail: ContactList[]
  html_content: string
  text_content: string
  from_name: string
  from_email: string
  reply_to: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed' | 'cancelled'
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  total_recipients: number
  sent_count: number
  failed_count: number
  open_count: number
  click_count: number
  bounce_count: number
  reply_count: number
  campaign_variables: Record<string, string>
  use_custom_smtp_routing: boolean
  smtp_routes: CampaignSMTPRoute[]
  track_opens: boolean
  track_clicks: boolean
  delivery_rate: number
  failure_rate: number
  created_at: string
  updated_at: string
}

export interface SequenceSMTPRoute {
  id: number
  smtp_account: number
  smtp_name: string
  weight: number
  is_active: boolean
}

export interface SequenceStep {
  id: number
  sequence: number
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
}

export interface Sequence {
  id: number
  name: string
  contact_list_ids: number[]
  contact_lists_detail: ContactList[]
  from_name: string
  from_email: string
  reply_to: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  use_custom_smtp_routing: boolean
  smtp_routes: SequenceSMTPRoute[]
  track_opens: boolean
  track_clicks: boolean
  stop_on_reply: boolean
  steps: SequenceStep[]
  created_at: string
  updated_at: string
}

export interface SequenceListItem {
  id: number
  name: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  contact_list_count: number
  step_count: number
  enrollment_count: number
  created_at: string
}

export interface SequenceEnrollment {
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

export interface InboxMessage {
  id: number
  direction: 'inbound' | 'outbound'
  from_email: string
  to_email: string
  subject: string
  body_html: string
  body_text: string
  occurred_at: string
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
  is_unread: boolean
  created_at: string
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
