from django.db import models
from django.conf import settings


class Workflow(models.Model):
    """A node/edge automation graph (Instantly/Zapier-style canvas). The graph
    itself lives in WorkflowNode/WorkflowEdge; this model is just the
    container + activation flag."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workflows')
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class WorkflowNode(models.Model):
    NODE_TYPES = [
        ('trigger', 'Trigger'),
        ('condition', 'Condition'),
        ('action', 'Action'),
        ('end', 'End Workflow'),
    ]

    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name='nodes')
    node_type = models.CharField(max_length=20, choices=NODE_TYPES)
    # trigger:   {'trigger_type': 'opened'|'clicked'|'replied'|'bounced'|'added_to_list'|'tag_added'|'no_reply_after',
    #             'campaign_id': Optional[int], 'list_id': Optional[int], 'tag_id': Optional[int], 'days': Optional[int]}
    # condition: {'field': 'list'|'tag'|'status', 'list_id': Optional[int], 'tag_id': Optional[int], 'status': Optional[str]}
    # action:    {'action_type': 'add_to_list'|'remove_from_list'|'add_tag'|'remove_tag'|'start_sequence'
    #                            |'stop_sequence'|'update_contact_status'|'webhook', ...type-specific keys}
    # end:       {}
    config = models.JSONField(default=dict, blank=True)
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.workflow.name} [{self.node_type}]'


class WorkflowEdge(models.Model):
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name='edges')
    source_node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name='outgoing_edges')
    target_node = models.ForeignKey(WorkflowNode, on_delete=models.CASCADE, related_name='incoming_edges')
    # blank for a plain node -> node edge; 'yes'/'no' for a condition node's two branches.
    label = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.source_node_id} -> {self.target_node_id} ({self.label or "default"})'


class WorkflowRun(models.Model):
    """One row per (workflow, contact, dedup_key) firing. dedup_key stops a
    trigger re-running the same workflow for a contact it already fired for
    (e.g. re-opening an email they already opened)."""
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name='runs')
    contact = models.ForeignKey('contacts.Contact', on_delete=models.CASCADE, related_name='workflow_runs')
    dedup_key = models.CharField(max_length=255)
    trigger_context = models.JSONField(default=dict, blank=True)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['workflow', 'contact', 'dedup_key']
        ordering = ['-ran_at']

    def __str__(self):
        return f'{self.workflow.name} ran for {self.contact.email}'
