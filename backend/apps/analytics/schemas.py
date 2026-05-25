from ninja import Schema
from typing import Optional, List
from datetime import datetime


class SendLogOut(Schema):
    id: int
    campaign: int
    campaign_name: str
    contact: Optional[int] = None
    contact_email: str
    contact_name: str
    smtp_account: Optional[int] = None
    smtp_name: str
    status: str
    sent_at: Optional[datetime] = None
    opened_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    error_message: str
    created_at: datetime

    @staticmethod
    def resolve_campaign(obj):
        return obj.campaign_id

    @staticmethod
    def resolve_campaign_name(obj):
        return obj.campaign.name

    @staticmethod
    def resolve_contact(obj):
        return obj.contact_id

    @staticmethod
    def resolve_contact_email(obj):
        return obj.contact_email or (obj.contact.email if obj.contact else '')

    @staticmethod
    def resolve_contact_name(obj):
        return obj.contact_name or (obj.contact.full_name if obj.contact else '')

    @staticmethod
    def resolve_smtp_account(obj):
        return obj.smtp_account_id

    @staticmethod
    def resolve_smtp_name(obj):
        return obj.smtp_account.name if obj.smtp_account else ''


class RetryFailedIn(Schema):
    campaign_id: Optional[int] = None
    log_ids: Optional[List[int]] = None
