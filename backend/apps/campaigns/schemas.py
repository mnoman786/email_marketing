from ninja import Schema
from typing import Optional, List, Any, Dict
from datetime import datetime


class TemplateRefOut(Schema):
    id: int
    name: str
    subject: str
    preview_text: str
    variables: List[Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ContactListRefOut(Schema):
    id: int
    name: str
    description: str
    contact_count: int
    total_contacts: int
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_contact_count(obj):
        return obj.contact_count

    @staticmethod
    def resolve_total_contacts(obj):
        return obj.total_contacts


class SMTPRouteOut(Schema):
    id: int
    smtp_account: int
    smtp_name: str
    smtp_from_email: str
    weight: int
    is_active: bool

    @staticmethod
    def resolve_smtp_account(obj):
        return obj.smtp_account_id

    @staticmethod
    def resolve_smtp_name(obj):
        return obj.smtp_account.name

    @staticmethod
    def resolve_smtp_from_email(obj):
        return obj.smtp_account.from_email


class CampaignOut(Schema):
    id: int
    name: str
    subject: str
    preview_text: str
    template: Optional[int] = None
    template_detail: Optional[TemplateRefOut] = None
    contact_list_ids: List[int]
    contact_lists_detail: List[ContactListRefOut]
    html_content: str
    text_content: str
    from_name: str
    from_email: str
    reply_to: str
    status: str
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_recipients: int
    sent_count: int
    failed_count: int
    open_count: int
    click_count: int
    bounce_count: int
    reply_count: int
    campaign_variables: Dict[str, str]
    use_custom_smtp_routing: bool
    smtp_routes: List[SMTPRouteOut]
    track_opens: bool
    track_clicks: bool
    delivery_rate: float
    failure_rate: float
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_template(obj):
        return obj.template_id

    @staticmethod
    def resolve_template_detail(obj):
        return obj.template

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
    def resolve_delivery_rate(obj):
        return obj.delivery_rate

    @staticmethod
    def resolve_failure_rate(obj):
        return obj.failure_rate


class CampaignListOut(Schema):
    id: int
    name: str
    subject: str
    status: str
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_recipients: int
    sent_count: int
    failed_count: int
    open_count: int
    contact_list_count: int
    delivery_rate: float
    created_at: datetime

    @staticmethod
    def resolve_contact_list_count(obj):
        return obj.contact_lists.count()

    @staticmethod
    def resolve_delivery_rate(obj):
        return obj.delivery_rate


class CampaignIn(Schema):
    name: str
    subject: str
    preview_text: str = ''
    template: Optional[int] = None
    contact_list_ids: List[int] = []
    html_content: str = ''
    text_content: str = ''
    from_name: str = ''
    from_email: str = ''
    reply_to: str = ''
    campaign_variables: Dict[str, str] = {}
    use_custom_smtp_routing: bool = False
    track_opens: bool = True
    track_clicks: bool = True


class CampaignUpdateIn(Schema):
    name: Optional[str] = None
    subject: Optional[str] = None
    preview_text: Optional[str] = None
    template: Optional[int] = None
    contact_list_ids: Optional[List[int]] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    campaign_variables: Optional[Dict[str, str]] = None
    use_custom_smtp_routing: Optional[bool] = None
    track_opens: Optional[bool] = None
    track_clicks: Optional[bool] = None


class SendCampaignIn(Schema):
    scheduled_at: Optional[datetime] = None


class SMTPRouteIn(Schema):
    smtp_account: int
    weight: int = 10
    is_active: bool = True
