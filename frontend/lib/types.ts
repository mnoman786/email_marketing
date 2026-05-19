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
  use_custom_smtp_routing: boolean
  smtp_routes: CampaignSMTPRoute[]
  track_opens: boolean
  track_clicks: boolean
  delivery_rate: number
  failure_rate: number
  created_at: string
  updated_at: string
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
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked' | 'unsubscribed'
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
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

export interface PaginatedResponse<T> {
  count: number
  items: T[]
}
