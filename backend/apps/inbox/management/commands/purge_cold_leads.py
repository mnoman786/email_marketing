"""
Clean up cold-inbound "lead" threads that were auto-created before cold capture
became opt-in (and before the stronger automated-mail filter) — i.e. the
newsletters / password resets / OTPs / notifications that should never have
become leads.

Dry-run by default (just reports). Pass --apply to actually act, and choose
--archive (default, reversible) or --delete (removes threads + their contacts
if the contact has no send history).

    python manage.py purge_cold_leads                 # report only
    python manage.py purge_cold_leads --apply         # archive them
    python manage.py purge_cold_leads --apply --delete
    python manage.py purge_cold_leads --apply --user-email you@example.com
"""
from django.core.management.base import BaseCommand
from django.db.models import Q


class Command(BaseCommand):
    help = 'Archive or delete auto-created cold-inbound lead threads.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Actually act (default is a dry run).')
        parser.add_argument('--delete', action='store_true', help='Delete instead of archive.')
        parser.add_argument('--user-email', help='Limit to one user (by email).')

    def handle(self, *args, **opts):
        from apps.inbox.models import Thread
        from apps.analytics.models import SendLog

        qs = Thread.objects.filter(is_cold_lead=True).select_related('contact', 'user')
        if opts.get('user_email'):
            qs = qs.filter(user__email__iexact=opts['user_email'])

        total = qs.count()
        if not total:
            self.stdout.write(self.style.SUCCESS('No cold-lead threads found — nothing to do.'))
            return

        self.stdout.write(f'Found {total} cold-lead thread(s):')
        for t in qs[:50]:
            self.stdout.write(f'  [{t.id}] {t.contact.email} | {(t.subject or "")[:50]}')
        if total > 50:
            self.stdout.write(f'  ... and {total - 50} more')

        if not opts['apply']:
            self.stdout.write(self.style.WARNING(
                '\nDry run — nothing changed. Re-run with --apply (archive) or --apply --delete.'
            ))
            return

        if opts['delete']:
            # Collect contacts before deleting threads; only remove a contact if
            # it has no send history (never part of a campaign/sequence/sent mail)
            # so we don't orphan analytics or real contacts.
            contact_ids = list(qs.values_list('contact_id', flat=True))
            deleted, _ = qs.delete()
            from apps.contacts.models import Contact
            removable = Contact.objects.filter(id__in=contact_ids).exclude(
                Q(send_logs__isnull=False)
            ).distinct()
            removed_contacts = removable.count()
            removable.delete()
            self.stdout.write(self.style.SUCCESS(
                f'Deleted {total} thread(s) and {removed_contacts} orphaned contact(s).'
            ))
        else:
            updated = qs.update(is_archived=True)
            self.stdout.write(self.style.SUCCESS(
                f'Archived {updated} thread(s). They are now under the inbox "Archived" tab.'
            ))
