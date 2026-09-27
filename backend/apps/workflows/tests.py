from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.contacts.models import Contact
from apps.workflows.models import Workflow, WorkflowNode, WorkflowRun
from apps.workflows.schemas import WorkflowListOut
from apps.workflows.views import list_workflows


class WorkflowListCountTests(TestCase):
    def test_counts_without_loading_run_history(self):
        user = get_user_model().objects.create_user(username='workflow-owner', email='workflow@example.com', password='x')
        workflow = Workflow.objects.create(user=user, name='Welcome')
        WorkflowNode.objects.create(workflow=workflow, node_type='trigger')
        WorkflowNode.objects.create(workflow=workflow, node_type='end')
        for i in range(3):
            contact = Contact.objects.create(user=user, email=f'w{i}@example.com')
            WorkflowRun.objects.create(workflow=workflow, contact=contact, dedup_key=f'run-{i}')

        request = type('Request', (), {'auth': user})()
        with self.assertNumQueries(1):
            listed = list_workflows(request)
            self.assertEqual(WorkflowListOut.resolve_node_count(listed[0]), 2)
            self.assertEqual(WorkflowListOut.resolve_run_count(listed[0]), 3)
        self.assertEqual(getattr(listed[0], '_prefetched_objects_cache', {}), {})
