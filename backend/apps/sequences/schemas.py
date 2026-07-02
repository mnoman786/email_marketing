from ninja import Schema
from typing import Optional, List, Dict
from datetime import datetime, time


class ContactListRefOut(Schema):
    id: int
    name: str
    contact_count: int

    @staticmethod
    def resolve_contact_count(obj):
        return obj.contact_count


class SmtpAccountRefOut(Schema):
    id: int
    name: str
    from_email: str
    is_active: bool



class CampaignStepVariantOut(Schema):
    id: int
    step: int
    label: str
    subject: str
    html_content: str
    text_content: str
    is_active: bool

    @staticmethod
    def resolve_step(obj):
        return obj.step_id


class CampaignStepVariantIn(Schema):
    label: str = ''
    subject: str
    html_content: str = ''
    text_content: str = ''
    is_active: bool = True


class CampaignStepVariantUpdateIn(Schema):
    label: Optional[str] = None
    subject: Optional[str] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    is_active: Optional[bool] = None


class CampaignStepOut(Schema):
    id: int
    campaign: int
    order: int
    subject: str
    template: Optional[int] = None
    html_content: str
    text_content: str
    campaign_variables: Dict[str, str]
    delay_days: int
    delay_hours: int
    stop_on_open: bool
    stop_on_click: bool
    auto_optimize: bool
    auto_optimize_metric: str
    auto_optimize_min_sends: int
    variants: List[CampaignStepVariantOut]

    @staticmethod
    def resolve_campaign(obj):
        return obj.campaign_id

    @staticmethod
    def resolve_template(obj):
        return obj.template_id

    @staticmethod
    def resolve_variants(obj):
        return list(obj.variants.all())


class CampaignStepIn(Schema):
    order: int
    subject: str
    template: Optional[int] = None
    html_content: str = ''
    text_content: str = ''
    campaign_variables: Dict[str, str] = {}
    delay_days: int = 0
    delay_hours: int = 0
    stop_on_open: bool = False
    stop_on_click: bool = False
    auto_optimize: bool = False
    auto_optimize_metric: str = 'reply_rate'
    auto_optimize_min_sends: int = 30


class CampaignStepUpdateIn(Schema):
    order: Optional[int] = None
    subject: Optional[str] = None
    template: Optional[int] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    campaign_variables: Optional[Dict[str, str]] = None
    delay_days: Optional[int] = None
    delay_hours: Optional[int] = None
    stop_on_open: Optional[bool] = None
    stop_on_click: Optional[bool] = None
    auto_optimize: Optional[bool] = None
    auto_optimize_metric: Optional[str] = None
    auto_optimize_min_sends: Optional[int] = None


class CampaignOut(Schema):
    id: int
    name: str
    contact_list_ids: List[int]
    contact_lists_detail: List[ContactListRefOut]
    smtp_account_ids: List[int]
    smtp_accounts_detail: List[SmtpAccountRefOut]
    from_name: str
    from_email: str
    reply_to: str
    status: str
    track_opens: bool
    track_clicks: bool
    stop_on_reply: bool
    schedule_enabled: bool
    schedule_days: List[int]
    schedule_start_time: time
    schedule_end_time: time
    schedule_timezone: str
    steps: List[CampaignStepOut]
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_contact_list_ids(obj):
        return list(obj.contact_lists.values_list('id', flat=True))

    @staticmethod
    def resolve_contact_lists_detail(obj):
        return list(obj.contact_lists.all())

    @staticmethod
    def resolve_smtp_account_ids(obj):
        return list(obj.smtp_accounts.values_list('id', flat=True))

    @staticmethod
    def resolve_smtp_accounts_detail(obj):
        return list(obj.smtp_accounts.all())

    @staticmethod
    def resolve_steps(obj):
        return list(obj.steps.order_by('order').all())


class CampaignListOut(Schema):
    id: int
    name: str
    status: str
    contact_list_count: int
    step_count: int
    enrollment_count: int
    sent: int
    opened: int
    clicked: int
    replied: int
    created_at: datetime

    @staticmethod
    def resolve_contact_list_count(obj):
        return obj.contact_lists.count()

    @staticmethod
    def resolve_step_count(obj):
        return obj.steps.count()

    @staticmethod
    def resolve_enrollment_count(obj):
        return obj.enrollments.count()

    @staticmethod
    def resolve_sent(obj):
        return getattr(obj, 'sent_count', 0) or 0

    @staticmethod
    def resolve_opened(obj):
        return getattr(obj, 'opened_count', 0) or 0

    @staticmethod
    def resolve_clicked(obj):
        return getattr(obj, 'clicked_count', 0) or 0

    @staticmethod
    def resolve_replied(obj):
        return getattr(obj, 'replied_count', 0) or 0


class CampaignIn(Schema):
    name: str
    contact_list_ids: List[int] = []
    smtp_account_ids: List[int] = []
    from_name: str = ''
    from_email: str = ''
    reply_to: str = ''
    # Off by default: open/click tracking pixels & rewritten links hurt cold-email
    # deliverability, and Apple MPP makes open data unreliable (Instantly default).
    track_opens: bool = False
    track_clicks: bool = False
    stop_on_reply: bool = True
    schedule_enabled: bool = False
    schedule_days: List[int] = [0, 1, 2, 3, 4]
    schedule_start_time: time = time(9, 0)
    schedule_end_time: time = time(17, 0)
    schedule_timezone: str = 'UTC'


class CampaignUpdateIn(Schema):
    name: Optional[str] = None
    contact_list_ids: Optional[List[int]] = None
    smtp_account_ids: Optional[List[int]] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    track_opens: Optional[bool] = None
    track_clicks: Optional[bool] = None
    stop_on_reply: Optional[bool] = None
    schedule_enabled: Optional[bool] = None
    schedule_days: Optional[List[int]] = None
    schedule_start_time: Optional[time] = None
    schedule_end_time: Optional[time] = None
    schedule_timezone: Optional[str] = None


class EnrollmentOut(Schema):
    id: int
    contact: int
    contact_email: str
    contact_name: str
    current_step_order: Optional[int] = None
    status: str
    next_send_at: Optional[datetime] = None
    enrolled_at: datetime
    completed_at: Optional[datetime] = None

    @staticmethod
    def resolve_contact(obj):
        return obj.contact_id

    @staticmethod
    def resolve_contact_email(obj):
        return obj.contact.email

    @staticmethod
    def resolve_contact_name(obj):
        return obj.contact.full_name

    @staticmethod
    def resolve_current_step_order(obj):
        return obj.current_step.order if obj.current_step else None
