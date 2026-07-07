"""Redis-backed job progress used by the chunked bulk-import/verify dispatchers
(see apps/contacts/tasks.py, apps/contacts/progress.py)."""
from django.test import TestCase

from apps.contacts import progress


class ProgressTests(TestCase):
    def test_unknown_job_returns_none(self):
        self.assertIsNone(progress.get_progress('does-not-exist'))

    def test_start_job_initializes_zeroed_counters(self):
        progress.start_job('job-1', total=10)
        p = progress.get_progress('job-1')
        self.assertEqual(p['total'], 10)
        self.assertEqual(p['current'], 0)
        self.assertEqual(p['percent'], 0)
        self.assertFalse(p['done'])
        self.assertEqual(p['errors'], [])

    def test_concurrent_chunk_results_accumulate_atomically(self):
        progress.start_job('job-2', total=6)
        progress.add_chunk_result('job-2', current=3, created=2, blocked=1)
        progress.add_chunk_result('job-2', current=3, created=1, updated=2)

        p = progress.get_progress('job-2')
        self.assertEqual(p['current'], 6)
        self.assertEqual(p['created'], 3)
        self.assertEqual(p['updated'], 2)
        self.assertEqual(p['blocked'], 1)
        self.assertEqual(p['percent'], 100)
        self.assertTrue(p['done'])

    def test_errors_are_capped_at_twenty(self):
        progress.start_job('job-3', total=1)
        progress.add_chunk_result('job-3', errors=[{'row': i, 'error': 'x'} for i in range(15)])
        progress.add_chunk_result('job-3', errors=[{'row': i, 'error': 'x'} for i in range(15)])

        p = progress.get_progress('job-3')
        self.assertEqual(len(p['errors']), 20)

    def test_verify_style_counts(self):
        progress.start_job('job-4', total=4)
        progress.add_chunk_result('job-4', current=2, valid=2)
        progress.add_chunk_result('job-4', current=2, invalid=1, unknown=1)

        p = progress.get_progress('job-4')
        self.assertEqual(p['valid'], 2)
        self.assertEqual(p['invalid'], 1)
        self.assertEqual(p['unknown'], 1)
        self.assertTrue(p['done'])
