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
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_has_password(obj):
        return bool(obj._password)


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


class SMTPTestIn(Schema):
    test_email: EmailStr


class SMTPStatOut(Schema):
    id: int
    name: str
    from_email: str
    weight: int
    probability: float
    is_active: bool
    last_tested_at: Optional[datetime] = None
    last_test_success: Optional[bool] = None
