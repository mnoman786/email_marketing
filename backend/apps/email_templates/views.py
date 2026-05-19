from ninja import Router
from ninja.errors import HttpError
from ninja.pagination import paginate, PageNumberPagination
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.template import Template, Context
from typing import Optional, List
from .models import EmailTemplate
from .schemas import TemplateOut, TemplateListOut, TemplateIn, TemplateUpdateIn, PreviewIn, PreviewOut
from apps.accounts.auth import auth

router = Router(tags=['Templates'])


@router.get('/', response=List[TemplateListOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_templates(request, search: Optional[str] = None, is_active: Optional[bool] = None):
    qs = EmailTemplate.objects.filter(user=request.auth)
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(subject__icontains=search))
    if is_active is not None:
        qs = qs.filter(is_active=is_active)
    return qs


@router.post('/', response=TemplateOut, auth=auth)
def create_template(request, data: TemplateIn):
    return EmailTemplate.objects.create(user=request.auth, **data.dict())


@router.get('/{template_id}/', response=TemplateOut, auth=auth)
def get_template(request, template_id: int):
    return get_object_or_404(EmailTemplate, id=template_id, user=request.auth)


@router.patch('/{template_id}/', response=TemplateOut, auth=auth)
def update_template(request, template_id: int, data: TemplateUpdateIn):
    template = get_object_or_404(EmailTemplate, id=template_id, user=request.auth)
    for field, value in data.dict(exclude_none=True).items():
        setattr(template, field, value)
    template.save()
    return template


@router.delete('/{template_id}/', auth=auth)
def delete_template(request, template_id: int):
    get_object_or_404(EmailTemplate, id=template_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/{template_id}/preview/', response=PreviewOut, auth=auth)
def preview_template(request, template_id: int, data: PreviewIn):
    template = get_object_or_404(EmailTemplate, id=template_id, user=request.auth)
    try:
        rendered = Template(template.html_content).render(Context(data.variables))
        return {'subject': template.subject, 'html': rendered, 'text': template.text_content}
    except Exception as e:
        raise HttpError(400, str(e))


@router.post('/{template_id}/duplicate/', response=TemplateOut, auth=auth)
def duplicate_template(request, template_id: int):
    template = get_object_or_404(EmailTemplate, id=template_id, user=request.auth)
    template.pk = None
    template.name = f'{template.name} (Copy)'
    template.save()
    return template
