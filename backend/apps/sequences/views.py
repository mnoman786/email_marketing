import logging
from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from typing import Optional, List
from .models import Sequence, SequenceStep, SequenceEnrollment, SequenceSMTPRoute
from .schemas import (
    SequenceOut, SequenceListOut, SequenceIn, SequenceUpdateIn,
    SequenceStepOut, SequenceStepIn, SequenceStepUpdateIn,
    SMTPRouteOut, SMTPRouteIn, EnrollmentOut,
)
from apps.accounts.auth import auth

logger = logging.getLogger(__name__)
router = Router(tags=['Sequences'])


@router.get('/', response=List[SequenceListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_sequences(request, status: Optional[str] = None, search: Optional[str] = None):
    qs = Sequence.objects.filter(user=request.auth).prefetch_related('contact_lists', 'steps', 'enrollments')
    if status:
        qs = qs.filter(status=status)
    if search:
        qs = qs.filter(Q(name__icontains=search))
    return qs


@router.post('/', response=SequenceOut, auth=auth)
def create_sequence(request, data: SequenceIn):
    payload = data.dict()
    list_ids = payload.pop('contact_list_ids', [])
    payload['user'] = request.auth
    sequence = Sequence.objects.create(**payload)
    if list_ids:
        from apps.contacts.models import ContactList
        sequence.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return sequence


@router.get('/{sequence_id}/', response=SequenceOut, auth=auth)
def get_sequence(request, sequence_id: int):
    return get_object_or_404(
        Sequence.objects.prefetch_related('contact_lists', 'steps', 'smtp_routes__smtp_account'),
        id=sequence_id, user=request.auth
    )


@router.patch('/{sequence_id}/', response=SequenceOut, auth=auth)
def update_sequence(request, sequence_id: int, data: SequenceUpdateIn):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    payload = data.dict(exclude_none=True)
    list_ids = payload.pop('contact_list_ids', None)
    for field, value in payload.items():
        setattr(sequence, field, value)
    sequence.save()
    if list_ids is not None:
        from apps.contacts.models import ContactList
        sequence.contact_lists.set(ContactList.objects.filter(user=request.auth, id__in=list_ids))
    return sequence


@router.delete('/{sequence_id}/', auth=auth)
def delete_sequence(request, sequence_id: int):
    get_object_or_404(Sequence, id=sequence_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.get('/{sequence_id}/steps/', response=List[SequenceStepOut], auth=auth)
def list_steps(request, sequence_id: int):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    return list(sequence.steps.order_by('order'))


@router.post('/{sequence_id}/steps/', response=SequenceStepOut, auth=auth)
def create_step(request, sequence_id: int, data: SequenceStepIn):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    payload = data.dict()
    template_id = payload.pop('template', None)
    if template_id:
        payload['template_id'] = template_id
    return SequenceStep.objects.create(sequence=sequence, **payload)


@router.patch('/{sequence_id}/steps/{step_id}/', response=SequenceStepOut, auth=auth)
def update_step(request, sequence_id: int, step_id: int, data: SequenceStepUpdateIn):
    step = get_object_or_404(SequenceStep, id=step_id, sequence_id=sequence_id, sequence__user=request.auth)
    payload = data.dict(exclude_none=True)
    template_id = payload.pop('template', None)
    for field, value in payload.items():
        setattr(step, field, value)
    if template_id is not None:
        step.template_id = template_id
    step.save()
    return step


@router.delete('/{sequence_id}/steps/{step_id}/', auth=auth)
def delete_step(request, sequence_id: int, step_id: int):
    get_object_or_404(SequenceStep, id=step_id, sequence_id=sequence_id, sequence__user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/{sequence_id}/activate/', auth=auth)
def activate_sequence(request, sequence_id: int):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    if sequence.status not in ('draft', 'paused'):
        raise HttpError(400, f'Cannot activate sequence in "{sequence.status}" status.')
    if not sequence.steps.exists():
        raise HttpError(400, 'Sequence has no steps.')
    sequence.status = 'active'
    sequence.save(update_fields=['status'])
    from .tasks import enroll_due_contacts
    try:
        enroll_due_contacts.delay()
    except Exception:
        logger.warning('Could not queue immediate enrollment; the beat schedule will pick it up.')
    return {'status': 'active'}


@router.post('/{sequence_id}/pause/', auth=auth)
def pause_sequence(request, sequence_id: int):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    if sequence.status != 'active':
        raise HttpError(400, 'Only active sequences can be paused.')
    sequence.status = 'paused'
    sequence.save(update_fields=['status'])
    return {'status': 'paused'}


@router.post('/{sequence_id}/resume/', auth=auth)
def resume_sequence(request, sequence_id: int):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    if sequence.status != 'paused':
        raise HttpError(400, 'Only paused sequences can be resumed.')
    sequence.status = 'active'
    sequence.save(update_fields=['status'])
    return {'status': 'active'}


@router.get('/{sequence_id}/smtp-routes/', response=List[SMTPRouteOut], auth=auth)
def get_smtp_routes(request, sequence_id: int):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    return list(SequenceSMTPRoute.objects.filter(sequence=sequence).select_related('smtp_account'))


@router.post('/{sequence_id}/smtp-routes/', auth=auth)
def set_smtp_routes(request, sequence_id: int, data: List[SMTPRouteIn]):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    SequenceSMTPRoute.objects.filter(sequence=sequence).delete()
    for route in data:
        SequenceSMTPRoute.objects.create(sequence=sequence, **route.dict())
    return {'status': 'routes updated'}


@router.get('/{sequence_id}/enrollments/', response=List[EnrollmentOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_enrollments(request, sequence_id: int, status: Optional[str] = None):
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    qs = sequence.enrollments.select_related('contact', 'current_step')
    if status:
        qs = qs.filter(status=status)
    return qs


@router.get('/{sequence_id}/stats/', auth=auth)
def sequence_stats(request, sequence_id: int):
    from apps.analytics.models import SendLog
    sequence = get_object_or_404(Sequence, id=sequence_id, user=request.auth)
    steps = list(sequence.steps.order_by('order'))

    step_stats = []
    for step in steps:
        logs = SendLog.objects.filter(sequence_step=step)
        step_stats.append({
            'step_id': step.id,
            'order': step.order,
            'subject': step.subject,
            'sent': logs.filter(status__in=('sent', 'opened', 'clicked', 'replied')).count(),
            'failed': logs.filter(status='failed').count(),
            'opened': logs.filter(status__in=('opened', 'clicked', 'replied')).count(),
            'clicked': logs.filter(status__in=('clicked', 'replied')).count(),
            'replied': logs.filter(status='replied').count(),
        })

    enrollment_counts = {
        row['status']: row['count']
        for row in sequence.enrollments.values('status').annotate(count=Count('id'))
    }

    return {
        'id': sequence.id,
        'name': sequence.name,
        'status': sequence.status,
        'total_enrolled': sequence.enrollments.count(),
        'enrollment_counts': enrollment_counts,
        'steps': step_stats,
    }
