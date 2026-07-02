"""Apollo.io lead finder proxy endpoints.

Proxies search and email-reveal requests to the Apollo.io People API,
then imports selected prospects directly into the user's contacts.
"""
import json
import urllib.request
import urllib.error
from ninja import Router
from ninja.errors import HttpError
from typing import Optional, List
from ninja import Schema
from apps.accounts.auth import auth

router = Router(tags=['Lead Finder'])

APOLLO_BASE = 'https://api.apollo.io/v1'


def _apollo_post(path: str, payload: dict, api_key: str) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{APOLLO_BASE}{path}',
        data=data,
        headers={
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': api_key,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')
        raise HttpError(e.code, f'Apollo API error: {body[:200]}')
    except urllib.error.URLError as e:
        raise HttpError(502, f'Could not reach Apollo API: {e.reason}')


class LeadSearchIn(Schema):
    query: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    industry: Optional[str] = None
    page: int = 1
    per_page: int = 25


class LeadRevealIn(Schema):
    person_id: str


class LeadImportIn(Schema):
    people: List[dict]
    list_id: Optional[int] = None


@router.post('/search/')
def search_leads(request, data: LeadSearchIn):
    user = request.auth
    if not user.apollo_api_key:
        raise HttpError(400, 'No Apollo API key configured. Add it in Settings → Integrations.')

    payload: dict = {
        'page': data.page,
        'per_page': data.per_page,
    }
    if data.query:
        payload['q_keywords'] = data.query
    if data.title:
        payload['person_titles'] = [data.title]
    if data.company:
        payload['organization_name'] = data.company
    if data.location:
        payload['person_locations'] = [data.location]
    if data.industry:
        payload['organization_industry_tag_ids'] = [data.industry]

    result = _apollo_post('/mixed_people/search', payload, user.apollo_api_key)

    people = [
        {
            'id': p.get('id'),
            'name': p.get('name', ''),
            'first_name': p.get('first_name', ''),
            'last_name': p.get('last_name', ''),
            'title': p.get('title', ''),
            'email': p.get('email'),
            'email_status': p.get('email_status', 'unknown'),
            'company': (p.get('organization') or {}).get('name', ''),
            'company_website': (p.get('organization') or {}).get('website_url', ''),
            'industry': (p.get('organization') or {}).get('industry', ''),
            'city': p.get('city', ''),
            'state': p.get('state', ''),
            'country': p.get('country', ''),
            'linkedin_url': p.get('linkedin_url', ''),
            'phone': (p.get('phone_numbers') or [{}])[0].get('sanitized_number', ''),
        }
        for p in result.get('people', [])
    ]

    pagination = result.get('pagination', {})
    return {
        'people': people,
        'total': pagination.get('total_entries', 0),
        'page': pagination.get('page', data.page),
        'per_page': pagination.get('per_page', data.per_page),
    }


@router.post('/reveal/')
def reveal_email(request, data: LeadRevealIn):
    user = request.auth
    if not user.apollo_api_key:
        raise HttpError(400, 'No Apollo API key configured.')

    result = _apollo_post('/people/match', {'id': data.person_id, 'reveal_personal_emails': False},
                          user.apollo_api_key)
    person = result.get('person', {})
    return {
        'id': data.person_id,
        'email': person.get('email'),
        'email_status': person.get('email_status', 'unknown'),
    }


@router.post('/import/')
def import_leads(request, data: LeadImportIn):
    from apps.contacts.models import Contact, ContactList, Suppression
    user = request.auth

    target_list = None
    if data.list_id:
        from django.shortcuts import get_object_or_404
        target_list = get_object_or_404(ContactList, id=data.list_id, user=user)

    suppressed = set(
        Suppression.objects.filter(user=user).values_list('email', flat=True)
    )

    created, skipped = 0, 0
    imported_contacts = []

    for person in data.people:
        email = (person.get('email') or '').strip().lower()
        if not email or email in suppressed:
            skipped += 1
            continue

        contact, was_created = Contact.objects.update_or_create(
            user=user,
            email=email,
            defaults={
                'first_name': person.get('first_name', ''),
                'last_name': person.get('last_name', ''),
                'company': person.get('company', ''),
                'title': person.get('title', ''),
                'phone': person.get('phone', ''),
                'website': person.get('company_website', ''),
                'city': person.get('city', ''),
                'state': person.get('state', ''),
                'country': person.get('country', ''),
            },
        )

        if target_list:
            contact.lists.add(target_list)

        imported_contacts.append(contact.id)
        if was_created:
            created += 1

    updated = len(data.people) - created - skipped
    return {'created': created, 'updated': updated, 'skipped': skipped}
