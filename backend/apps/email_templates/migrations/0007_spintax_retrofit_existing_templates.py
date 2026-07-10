from django.db import migrations

# The 32 templates seeded in migrations 0003/0005 all open with a plain
# "Hi {{first_name}}," greeting. Swap it for a spintax greeting so every
# built-in template (all 100, after 0006) varies its wording across sends —
# matches the {a|b|c} syntax apps.campaigns.services.render_template_for_contact
# already spins on.
OLD_GREETING = 'Hi {{first_name}},'
NEW_GREETING = '{Hi|Hey|Hello} {{first_name}},'


def apply(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    for tpl in EmailTemplate.objects.filter(user=None, is_system=True, html_content__contains=OLD_GREETING):
        tpl.html_content = tpl.html_content.replace(OLD_GREETING, NEW_GREETING, 1)
        tpl.text_content = tpl.text_content.replace(OLD_GREETING, NEW_GREETING, 1)
        tpl.save(update_fields=['html_content', 'text_content'])


def revert(apps, schema_editor):
    EmailTemplate = apps.get_model('email_templates', 'EmailTemplate')
    for tpl in EmailTemplate.objects.filter(user=None, is_system=True, html_content__contains=NEW_GREETING):
        tpl.html_content = tpl.html_content.replace(NEW_GREETING, OLD_GREETING, 1)
        tpl.text_content = tpl.text_content.replace(NEW_GREETING, OLD_GREETING, 1)
        tpl.save(update_fields=['html_content', 'text_content'])


class Migration(migrations.Migration):

    dependencies = [
        ('email_templates', '0006_add_68_more_spintax_templates'),
    ]

    operations = [
        migrations.RunPython(apply, revert),
    ]
