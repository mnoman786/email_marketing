from ninja import Schema
from typing import Optional
from datetime import datetime


class InboxMessageOut(Schema):
    id: int
    direction: str
    from_email: str
    to_email: str
    subject: str
    body_html: str
    body_text: str
    occurred_at: datetime


class ThreadOut(Schema):
    id: int
    contact: int
    contact_email: str
    contact_name: str
    smtp_account: int
    smtp_account_name: str
    subject: str
    last_message_at: Optional[datetime] = None
    is_unread: bool
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
        preview = last.body_text or last.body_html
        return preview[:140]


class ThreadDetailOut(ThreadOut):
    messages: list[InboxMessageOut]

    @staticmethod
    def resolve_messages(obj):
        return list(obj.messages.order_by('occurred_at'))


class ReplyIn(Schema):
    html_content: str
    text_content: str = ''
