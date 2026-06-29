from ninja import Schema
from pydantic import EmailStr
from typing import Optional
from datetime import datetime


class SMTPAccountOut(Schema):
    id: int
    name: str
    host: str
    port: int
    username: str
    has_password: bool
    from_email: str
    from_name: str
    security: str
    weight: int
    is_active: bool
    daily_limit: int
    hourly_limit: int
    last_tested_at: Optional[datetime] = None
    last_test_success: Optional[bool] = None
    imap_enabled: bool
    imap_host: str
    imap_port: int
    imap_username: str
    has_imap_password: bool
    imap_use_ssl: bool
    capture_cold_leads: bool
    last_imap_checked_at: Optional[datetime] = None
    last_imap_tested_at: Optional[datetime] = None
    last_imap_test_success: Optional[bool] = None
    signature_html: str
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_has_password(obj):
        return bool(obj._password)

    @staticmethod
    def resolve_has_imap_password(obj):
        return bool(obj._imap_password)


class SMTPAccountIn(Schema):
    name: str
    host: str
    port: int = 587
    username: str
    password: str = ''
    from_email: EmailStr
    from_name: str
    security: str = 'tls'
    weight: int = 10
    is_active: bool = True
    daily_limit: int = 0
    hourly_limit: int = 0
    imap_enabled: bool = False
    imap_host: str = ''
    imap_port: int = 993
    imap_username: str = ''
    imap_password: str = ''
    imap_use_ssl: bool = True
    capture_cold_leads: bool = False
    signature_html: str = ''


class SMTPAccountUpdateIn(Schema):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None
    security: Optional[str] = None
    weight: Optional[int] = None
    is_active: Optional[bool] = None
    daily_limit: Optional[int] = None
    hourly_limit: Optional[int] = None
    imap_enabled: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    imap_use_ssl: Optional[bool] = None
    capture_cold_leads: Optional[bool] = None
    signature_html: Optional[str] = None


class SMTPTestIn(Schema):
    test_email: EmailStr


class IMAPTestIn(Schema):
    """All fields optional: a saved account's stored values are used as fallback
    for any field omitted (e.g. an untouched password field)."""
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    imap_use_ssl: Optional[bool] = None


class SMTPStatOut(Schema):
    id: int
    name: str
    from_email: str
    weight: int
    probability: float
    is_active: bool
    last_tested_at: Optional[datetime] = None
    last_test_success: Optional[bool] = None
