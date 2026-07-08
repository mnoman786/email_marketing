from datetime import datetime
from typing import Any, Dict, List, Optional

from ninja import Schema


class WorkflowNodeOut(Schema):
    id: int
    node_type: str
    config: Dict[str, Any]
    position_x: float
    position_y: float


class WorkflowEdgeOut(Schema):
    id: int
    source_node: int
    target_node: int
    label: str

    @staticmethod
    def resolve_source_node(obj):
        return obj.source_node_id

    @staticmethod
    def resolve_target_node(obj):
        return obj.target_node_id


class WorkflowListOut(Schema):
    id: int
    name: str
    is_active: bool
    node_count: int
    run_count: int
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_node_count(obj):
        return obj.nodes.count()

    @staticmethod
    def resolve_run_count(obj):
        return obj.runs.count()


class WorkflowDetailOut(Schema):
    id: int
    name: str
    is_active: bool
    nodes: List[WorkflowNodeOut]
    edges: List[WorkflowEdgeOut]
    run_count: int
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_nodes(obj):
        return list(obj.nodes.order_by('id'))

    @staticmethod
    def resolve_edges(obj):
        return list(obj.edges.order_by('id'))

    @staticmethod
    def resolve_run_count(obj):
        return obj.runs.count()


class WorkflowIn(Schema):
    name: str


class WorkflowUpdateIn(Schema):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class NodeIn(Schema):
    client_id: str
    node_type: str
    config: Dict[str, Any] = {}
    position_x: float = 0
    position_y: float = 0


class EdgeIn(Schema):
    source_client_id: str
    target_client_id: str
    label: str = ''


class WorkflowGraphIn(Schema):
    nodes: List[NodeIn]
    edges: List[EdgeIn]


class WorkflowRunOut(Schema):
    id: int
    contact_id: int
    contact_email: str
    dedup_key: str
    trigger_context: Dict[str, Any]
    ran_at: datetime

    @staticmethod
    def resolve_contact_id(obj):
        return obj.contact_id

    @staticmethod
    def resolve_contact_email(obj):
        return obj.contact.email
