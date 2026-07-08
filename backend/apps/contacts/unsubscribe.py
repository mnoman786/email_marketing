"""One-click unsubscribe: a signed, permanent-ish token identifying a Contact,
embedded in every outbound email (List-Unsubscribe header + footer link) so a
recipient can opt out without an account or a login. Required for CAN-SPAM/
GDPR compliance on cold email — see apps/campaigns/services.py for where the
link is injected into the message.
"""
from django.core import signing

_SALT = 'contacts.unsubscribe'
_MAX_AGE = 60 * 60 * 24 * 365 * 5  # 5 years — long enough to be "permanent" without being unbounded


def make_unsubscribe_token(contact):
    return signing.dumps({'c': contact.id}, salt=_SALT)


def verify_unsubscribe_token(token):
    """Returns the Contact the token was issued for, or None if it's invalid,
    tampered with, expired, or the contact no longer exists."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=_MAX_AGE)
    except signing.BadSignature:
        return None

    from .models import Contact
    return Contact.objects.filter(id=data.get('c')).first()


def unsubscribe_url(contact, base_url):
    return f'{base_url.rstrip("/")}/api/contacts/unsubscribe/{make_unsubscribe_token(contact)}/'
