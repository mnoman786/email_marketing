import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class WorkflowsConfig(AppConfig):
    name = 'apps.workflows'

    def ready(self):
        from django.db.models.signals import m2m_changed
        from apps.contacts.models import Contact

        m2m_changed.connect(_on_contact_lists_changed, sender=Contact.lists.through)
        m2m_changed.connect(_on_contact_tags_changed, sender=Contact.tags.through)


def _on_contact_lists_changed(sender, instance, action, reverse, pk_set, **kwargs):
    """Fires the 'added_to_list' trigger. Handles both call directions:
    contact.lists.add(list) (instance=Contact, pk_set=list ids) and
    contact_list.contacts.add(*contacts) (instance=ContactList, pk_set=contact ids) —
    the latter is how bulk CSV promotion adds a whole batch in one call."""
    if action != 'post_add' or not pk_set:
        return

    from .services import evaluate_added_to_list

    try:
        if reverse:
            evaluate_added_to_list(pk_set, instance.id, instance.user_id)
        else:
            for list_id in pk_set:
                evaluate_added_to_list([instance.id], list_id, instance.user_id)
    except Exception:
        logger.exception('Workflow added_to_list evaluation failed')


def _on_contact_tags_changed(sender, instance, action, reverse, pk_set, **kwargs):
    """Fires the 'tag_added' trigger. Same forward/reverse handling as
    _on_contact_lists_changed (contact.tags.add(tag) vs tag.contacts.add(*contacts))."""
    if action != 'post_add' or not pk_set:
        return

    from .services import evaluate_tag_added

    try:
        if reverse:
            evaluate_tag_added(pk_set, instance.id, instance.user_id)
        else:
            for tag_id in pk_set:
                evaluate_tag_added([instance.id], tag_id, instance.user_id)
    except Exception:
        logger.exception('Workflow tag_added evaluation failed')
