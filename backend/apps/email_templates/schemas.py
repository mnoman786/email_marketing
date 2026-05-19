from ninja import Schema
from typing import Optional, List, Any, Dict
from datetime import datetime


class TemplateOut(Schema):
    id: int
    name: str
    subject: str
    preview_text: str
    html_content: str
    text_content: str
    variables: List[Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TemplateListOut(Schema):
    id: int
    name: str
    subject: str
    preview_text: str
    variables: List[Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TemplateIn(Schema):
    name: str
    subject: str
    preview_text: str = ''
    html_content: str
    text_content: str = ''
    variables: List[str] = []
    is_active: bool = True


class TemplateUpdateIn(Schema):
    name: Optional[str] = None
    subject: Optional[str] = None
    preview_text: Optional[str] = None
    html_content: Optional[str] = None
    text_content: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: Optional[bool] = None


class PreviewIn(Schema):
    variables: Dict[str, Any] = {}


class PreviewOut(Schema):
    subject: str
    html: str
    text: str
