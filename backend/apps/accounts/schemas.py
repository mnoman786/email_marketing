from ninja import Schema
from pydantic import EmailStr, field_validator, model_validator
from typing import Optional
from datetime import datetime


class UserOut(Schema):
    id: int
    email: str
    username: str
    first_name: str
    last_name: str
    company_name: str
    timezone: str
    is_email_verified: bool
    created_at: datetime


class RegisterIn(Schema):
    email: EmailStr
    username: str
    first_name: str = ''
    last_name: str = ''
    company_name: str = ''
    password: str
    password_confirm: str

    @field_validator('password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters.')
        return v

    @model_validator(mode='after')
    def passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError('Passwords do not match.')
        return self


class LoginIn(Schema):
    email: EmailStr
    password: str


class TokenOut(Schema):
    access: str
    refresh: str
    user: UserOut


class TokenRefreshIn(Schema):
    refresh: str


class TokenRefreshOut(Schema):
    access: str


class RegisterOut(Schema):
    detail: str
    email: str


class VerifyEmailIn(Schema):
    token: str


class ResendVerificationIn(Schema):
    email: EmailStr


class ProfileUpdateIn(Schema):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    timezone: Optional[str] = None


class ChangePasswordIn(Schema):
    old_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 8:
            raise ValueError('New password must be at least 8 characters.')
        return v
