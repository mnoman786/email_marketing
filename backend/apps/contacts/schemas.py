from ninja import Schema
from pydantic import EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime


class ContactListOut(Schema):
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


class ContactListIn(Schema):
    name: str
    description: str = ''


class ContactListUpdateIn(Schema):
    name: Optional[str] = None
    description: Optional[str] = None


class ContactListRef(Schema):
    id: int
    name: str


class ContactOut(Schema):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    company: str
    status: str
    custom_fields: Dict[str, Any]
    full_name: str
    list_ids: List[int]
    list_names: List[ContactListRef]
    subscribed_at: datetime
    unsubscribed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_full_name(obj):
        return obj.full_name

    @staticmethod
    def resolve_list_ids(obj):
        return list(obj.lists.values_list('id', flat=True))

    @staticmethod
    def resolve_list_names(obj):
        return [{'id': l.id, 'name': l.name} for l in obj.lists.all()]


class ContactIn(Schema):
    email: EmailStr
    first_name: str = ''
    last_name: str = ''
    phone: str = ''
    company: str = ''
    status: str = 'active'
    custom_fields: Dict[str, Any] = {}
    list_ids: List[int] = []


class ContactUpdateIn(Schema):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    list_ids: Optional[List[int]] = None


class BulkImportIn(Schema):
    list_id: Optional[int] = None
    contacts: List[Dict[str, Any]]


class BulkImportOut(Schema):
    created: int
    updated: int
    failed: int
    errors: List[Dict[str, Any]]


class BulkImportStartOut(Schema):
    task_id: str
    total: int


class ImportStatusOut(Schema):
    state: str
    current: int
    total: int
    percent: int
    created: int
    updated: int
    failed: int
    errors: List[Dict[str, Any]]


class BulkDeleteIn(Schema):
    ids: List[int]


class AddRemoveContactsIn(Schema):
    contact_ids: List[int]
