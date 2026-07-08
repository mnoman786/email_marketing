from typing import List

from django.shortcuts import get_object_or_404
from ninja import Router
from ninja.pagination import PageNumberPagination, paginate

from apps.accounts.auth import auth

from .models import Workflow, WorkflowEdge, WorkflowNode
from .schemas import (
    WorkflowDetailOut, WorkflowGraphIn, WorkflowIn, WorkflowListOut,
    WorkflowRunOut, WorkflowUpdateIn,
)

router = Router(tags=['Workflows'])


@router.get('/', response=List[WorkflowListOut], auth=auth)
def list_workflows(request):
    return list(Workflow.objects.filter(user=request.auth).prefetch_related('nodes', 'runs'))


@router.post('/', response=WorkflowDetailOut, auth=auth)
def create_workflow(request, data: WorkflowIn):
    return Workflow.objects.create(user=request.auth, name=data.name)


@router.get('/{workflow_id}/', response=WorkflowDetailOut, auth=auth)
def get_workflow(request, workflow_id: int):
    return get_object_or_404(
        Workflow.objects.prefetch_related('nodes', 'edges'), id=workflow_id, user=request.auth
    )


@router.patch('/{workflow_id}/', response=WorkflowDetailOut, auth=auth)
def update_workflow(request, workflow_id: int, data: WorkflowUpdateIn):
    workflow = get_object_or_404(Workflow, id=workflow_id, user=request.auth)
    for field, value in data.dict(exclude_none=True).items():
        setattr(workflow, field, value)
    workflow.save()
    return workflow


@router.delete('/{workflow_id}/', auth=auth)
def delete_workflow(request, workflow_id: int):
    get_object_or_404(Workflow, id=workflow_id, user=request.auth).delete()
    return {'detail': 'Deleted.'}


@router.post('/{workflow_id}/toggle/', response=WorkflowDetailOut, auth=auth)
def toggle_workflow(request, workflow_id: int):
    workflow = get_object_or_404(Workflow, id=workflow_id, user=request.auth)
    workflow.is_active = not workflow.is_active
    workflow.save(update_fields=['is_active'])
    return workflow


@router.put('/{workflow_id}/graph/', response=WorkflowDetailOut, auth=auth)
def save_graph(request, workflow_id: int, data: WorkflowGraphIn):
    """Whole-graph replace: the canvas always saves its full current state,
    so there's no per-node create/update/delete diffing to get right — same
    trade-off apps.sequences makes for transitions, just at graph scale."""
    workflow = get_object_or_404(Workflow, id=workflow_id, user=request.auth)
    workflow.edges.all().delete()
    workflow.nodes.all().delete()

    id_map = {}
    for n in data.nodes:
        node = WorkflowNode.objects.create(
            workflow=workflow, node_type=n.node_type, config=n.config,
            position_x=n.position_x, position_y=n.position_y,
        )
        id_map[n.client_id] = node.id

    for e in data.edges:
        source_id = id_map.get(e.source_client_id)
        target_id = id_map.get(e.target_client_id)
        if not source_id or not target_id:
            continue
        WorkflowEdge.objects.create(
            workflow=workflow, source_node_id=source_id, target_node_id=target_id, label=e.label
        )

    return get_object_or_404(Workflow.objects.prefetch_related('nodes', 'edges'), id=workflow.id)


@router.get('/{workflow_id}/runs/', response=List[WorkflowRunOut], auth=auth)
@paginate(PageNumberPagination, page_size=20)
def list_workflow_runs(request, workflow_id: int):
    workflow = get_object_or_404(Workflow, id=workflow_id, user=request.auth)
    return workflow.runs.select_related('contact').order_by('-ran_at')
