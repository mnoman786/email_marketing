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
        # list_contact_lists() annotates _contact_count so this avoids a
        # per-row COUNT query; falls back to the model property for single-
        # object endpoints (get_contact_list) that aren't annotated.
        return obj._contact_count if hasattr(obj, '_contact_count') else obj.contact_count

    @staticmethod
    def resolve_total_contacts(obj):
        return obj._total_contacts if hasattr(obj, '_total_contacts') else obj.total_contacts


class ContactListIn(Schema):
    name: str
    description: str = ''


class ContactListUpdateIn(Schema):
    name: Optional[str] = None
    description: Optional[str] = None


class ContactListRef(Schema):
    id: int
    name: str


class TagOut(Schema):
    id: int
    name: str
    color: str
    contact_count: int
    created_at: datetime

    @staticmethod
    def resolve_contact_count(obj):
        # Reuses list_tags()'s prefetch_related('contacts') cache instead of
        # firing a fresh COUNT query per row.
        return len(obj.contacts.all())


class TagIn(Schema):
    name: str
    color: str = 'gray'


class TagUpdateIn(Schema):
    name: Optional[str] = None
    color: Optional[str] = None


class TagRef(Schema):
    id: int
    name: str
    color: str


class ContactOut(Schema):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    company: str
    status: str
    verification_status: str
    verification_detail: Dict[str, Any] = {}
    verified_at: Optional[datetime] = None
    custom_fields: Dict[str, Any]
    full_name: str
    list_ids: List[int]
    list_names: List[ContactListRef]
    tag_ids: List[int] = []
    tags_detail: List[TagRef] = []
    subscribed_at: datetime
    unsubscribed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_full_name(obj):
        return obj.full_name

    @staticmethod
    def resolve_list_ids(obj):
        # Use the prefetched lists (list views prefetch_related('lists')) rather
        # than .values_list(), which would fire a fresh query per contact.
        return [l.id for l in obj.lists.all()]

    @staticmethod
    def resolve_list_names(obj):
        return [{'id': l.id, 'name': l.name} for l in obj.lists.all()]

    @staticmethod
    def resolve_tag_ids(obj):
        return [t.id for t in obj.tags.all()]

    @staticmethod
    def resolve_tags_detail(obj):
        return list(obj.tags.all())


class ContactIn(Schema):
    email: EmailStr
    first_name: str = ''
    last_name: str = ''
    phone: str = ''
    company: str = ''
    status: str = 'active'
    custom_fields: Dict[str, Any] = {}
    list_ids: List[int] = []
    tag_ids: List[int] = []


class ContactUpdateIn(Schema):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None
    list_ids: Optional[List[int]] = None
    tag_ids: Optional[List[int]] = None


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
    blocked: int = 0
    errors: List[Dict[str, Any]]


# --- Import validation (staging) ---

class ImportBatchOut(Schema):
    id: int
    name: str
    status: str
    total: int
    verified_count: int
    promoted_count: int
    percent: int
    counts: Dict[str, int] = {}   # per-bucket counts (valid/risky/invalid/...)
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_percent(obj):
        return round(obj.verified_count / obj.total * 100) if obj.total else 100


class StagedLeadOut(Schema):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str
    company: str
    verification_status: str
    verification_detail: Dict[str, Any] = {}
    promoted: bool


class ValidationImportIn(Schema):
    name: Optional[str] = None
    contacts: List[Dict[str, Any]]


class PromoteIn(Schema):
    list_id: Optional[int] = None      # add promoted leads to this list (optional)
    # Either promote an explicit set of staged-lead ids, or a whole bucket
    # ('valid', 'risky', ...). If both are given, ids win.
    lead_ids: Optional[List[int]] = None
    bucket: Optional[str] = None


class BulkDeleteIn(Schema):
    ids: List[int]


class VerifyBulkIn(Schema):
    # Re-verify a specific set, everyone in a list, or (both omitted) all of the
    # user's contacts.
    contact_ids: Optional[List[int]] = None
    list_id: Optional[int] = None


class VerifyStatusOut(Schema):
    state: str
    current: int
    total: int
    percent: int
    valid: int
    invalid: int
    unknown: int


class AddRemoveContactsIn(Schema):
    contact_ids: List[int]


class SuppressionOut(Schema):
    id: int
    email: str
    reason: str
    note: str
    created_at: datetime


class SuppressionIn(Schema):
    emails: List[str]
    note: str = ''


class SuppressionDeleteIn(Schema):
    ids: List[int]
