from ninja import Schema
from typing import Optional, List
from datetime import datetime
import re

_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')


class AttachmentOut(Schema):
    id: int
    filename: str
    content_type: str
    size: int
    url: str

    @staticmethod
    def resolve_url(obj):
        # Never the raw storage path — attachments live outside the public
        # media mount and are only served through this authenticated,
        # ownership-checked endpoint.
        return f'/api/inbox/attachments/{obj.id}/download/'


class InboxMessageOut(Schema):
    id: int
    direction: str
    from_email: str
    to_email: str
    subject: str
    body_html: str
    body_text: str
    occurred_at: datetime
    attachments: List[AttachmentOut] = []

    @staticmethod
    def resolve_attachments(obj):
        return list(obj.attachments.all())


class ThreadOut(Schema):
    id: int
    contact: int
    contact_email: str
    contact_name: str
    smtp_account: int
    smtp_account_name: str
    subject: str
    last_message_at: Optional[datetime] = None
    last_message_direction: str
    is_unread: bool
    is_archived: bool
    is_cold_lead: bool
    lead_status: str
    lead_status_auto: bool
    snoozed_until: Optional[datetime] = None
    created_at: datetime

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
    def resolve_smtp_account(obj):
        return obj.smtp_account_id

    @staticmethod
    def resolve_smtp_account_name(obj):
        return obj.smtp_account.name


class ThreadListOut(ThreadOut):
    last_message_preview: str

    @staticmethod
    def resolve_last_message_preview(obj):
        last = obj.messages.order_by('-occurred_at').first()
        if not last:
            return ''
        # body_text is often empty for rich-text replies, so we fall back to
        # body_html — which carries invisible markup like the open-tracking
        # pixel <img>. Strip tags so that never leaks into the preview text.
        preview = last.body_text or _WS_RE.sub(' ', _TAG_RE.sub(' ', last.body_html)).strip()
        return preview[:140]


class ThreadDetailOut(ThreadOut):
    messages: list[InboxMessageOut]

    @staticmethod
    def resolve_messages(obj):
        return list(obj.messages.order_by('occurred_at'))


class ReplyIn(Schema):
    html_content: str
    text_content: str = ''


class ThreadStatusIn(Schema):
    lead_status: str


class ThreadReadIn(Schema):
    is_unread: bool


class ThreadArchiveIn(Schema):
    is_archived: bool


class ThreadSnoozeIn(Schema):
    snoozed_until: Optional[datetime] = None


class BulkActionIn(Schema):
    ids: List[int]
    action: str  # archive | unarchive | mark_read | mark_unread | set_status
    lead_status: Optional[str] = None


class ComposeIn(Schema):
    contact_id: int
    smtp_account_id: int
    subject: str
    html_content: str
    text_content: str = ''


class ReplyTemplateOut(Schema):
    id: int
    name: str
    body_html: str
    body_text: str
    created_at: datetime


class ReplyTemplateIn(Schema):
    name: str
    body_html: str = ''
    body_text: str = ''


class ContactStatsOut(Schema):
    total_sent: int
    opened: int
    clicked: int
    replied: int
    bounced: int
    campaigns: List[str]
