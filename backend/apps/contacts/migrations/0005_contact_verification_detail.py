from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contacts', '0004_add_contact_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='contact',
            name='verification_detail',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
