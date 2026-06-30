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


class SMTPRouteOut(Schema):
    id: int
    smtp_account: int
    smtp_name: str
    weight: int
    is_active: bool

    @staticmethod
    def resolve_smtp_account(obj):
        return obj.smtp_account_id

    @staticmethod
    def resolve_smtp_name(obj):
        return obj.smtp_account.name


class SMTPRouteIn(Schema):
    smtp_account: int
    weight: int = 10
    is_active: bool = True


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

    @staticmethod
    def resolve_campaign(obj):
        return obj.campaign_id

    @staticmethod
    def resolve_template(obj):
        return obj.template_id


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


class CampaignOut(Schema):
    id: int
    name: str
    contact_list_ids: List[int]
    contact_lists_detail: List[ContactListRefOut]
    from_name: str
    from_email: str
    reply_to: str
    status: str
    use_custom_smtp_routing: bool
    smtp_routes: List[SMTPRouteOut]
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
    def resolve_smtp_routes(obj):
        return list(obj.smtp_routes.select_related('smtp_account').all())

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


class CampaignIn(Schema):
    name: str
    contact_list_ids: List[int] = []
    from_name: str = ''
    from_email: str = ''
    reply_to: str = ''
    use_custom_smtp_routing: bool = False
    track_opens: bool = True
    track_clicks: bool = True
    stop_on_reply: bool = True
    schedule_enabled: bool = False
    schedule_days: List[int] = [0, 1, 2, 3, 4]
    schedule_start_time: time = time(9, 0)
    schedule_end_time: time = time(17, 0)
    schedule_timezone: str = 'UTC'


class CampaignUpdateIn(Schema):
    name: Optional[str] = None
    contact_list_ids: Optional[List[int]] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    use_custom_smtp_routing: Optional[bool] = None
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
