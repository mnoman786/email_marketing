"""Redis-backed progress tracking for jobs that fan out across many independent
Celery chunk tasks (bulk import, bulk re-verify — see tasks.py).

A dispatcher task starts a job keyed by its own Celery task id (so the existing
`{'task_id': ...}` API response shape needs no changes), then each chunk task
reports its own contribution as it finishes. Counters use `cache.incr`, which is
atomic at the Redis level — the same guarantee `campaigns.services.reserve_send_slot`
already relies on — so concurrent chunk tasks can never lose an update.
"""
from django.core.cache import cache

_TTL = 6 * 60 * 60  # 6h — comfortably longer than any job should take to finish and be polled
_FIELDS = ('current', 'created', 'updated', 'blocked', 'failed', 'valid', 'invalid', 'unknown')


def _key(job_id, field):
    return f'job-progress:{job_id}:{field}'


def start_job(job_id, total):
    """Initialize a job's counters. Call once from the dispatcher before firing
    off any chunk tasks."""
    cache.set(_key(job_id, 'total'), total, timeout=_TTL)
    for field in _FIELDS:
        cache.set(_key(job_id, field), 0, timeout=_TTL)
    cache.delete(_key(job_id, 'errors'))


def add_chunk_result(job_id, current=0, errors=None, **field_deltas):
    """Atomically add one chunk's contribution to the job's counters.
    `field_deltas` may include any of created/updated/blocked/failed/valid/invalid/unknown.
    """
    if current:
        cache.incr(_key(job_id, 'current'), current)
    for field, delta in field_deltas.items():
        if field not in _FIELDS:
            continue
        if delta:
            cache.incr(_key(job_id, field), delta)
    if errors:
        key = _key(job_id, 'errors')
        existing = cache.get(key) or []
        # Best-effort (not atomic) — matches the existing errors[:20] pragmatism;
        # losing a couple of entries under a race doesn't affect the counts above.
        cache.set(key, (existing + list(errors))[:20], timeout=_TTL)


def get_progress(job_id):
    """Return the job's current progress dict, or None if the job id is unknown
    (never started, or its TTL has expired)."""
    total = cache.get(_key(job_id, 'total'))
    if total is None:
        return None
    current = cache.get(_key(job_id, 'current')) or 0
    result = {
        'total': total,
        'current': current,
        'percent': round(current / total * 100) if total else 100,
        'done': current >= total,
        'errors': cache.get(_key(job_id, 'errors')) or [],
    }
    for field in _FIELDS:
        if field == 'current':
            continue
        result[field] = cache.get(_key(job_id, field)) or 0
    return result
