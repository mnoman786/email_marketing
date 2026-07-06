"""Verification "buckets" — shared by the Leads views and the import-validation
workspace. They partition any model that has `verification_status` +
`verification_detail` (Contact and StagedLead) into exactly one bucket, so the
per-bucket counts always sum to the total."""
from django.db.models import Q

# Order is intentional: how the tabs are displayed left-to-right.
VERIFICATION_BUCKETS = ('valid', 'risky', 'invalid', 'disposable', 'unknown', 'unverified')


def bucket_filter(bucket):
    """Q object selecting one verification bucket. Unknown bucket names match
    nothing rather than everything, so a bad tab value can't leak all rows."""
    if bucket == 'valid':      # deliverable and not flagged high-risk
        return Q(verification_status='valid') & ~Q(verification_detail__risk='high')
    if bucket == 'risky':      # passed MX but high spam/send-risk (role, gibberish, typo)
        return Q(verification_status='valid', verification_detail__risk='high')
    if bucket == 'disposable':  # temp-mail — a subset of invalid, surfaced on its own
        return Q(verification_detail__is_disposable=True)
    if bucket == 'invalid':    # undeliverable, excluding the disposable subset
        return Q(verification_status='invalid') & ~Q(verification_detail__is_disposable=True)
    if bucket == 'unknown':
        return Q(verification_status='unknown')
    if bucket == 'unverified':
        return Q(verification_status='unverified')
    return Q(pk__in=[])


def bucket_counts(qs):
    """{bucket: count, ...} plus 'total' for a queryset."""
    counts = {b: qs.filter(bucket_filter(b)).count() for b in VERIFICATION_BUCKETS}
    counts['total'] = qs.count()
    return counts
