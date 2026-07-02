from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sequences', '0010_remove_smtp_routing'),
        ('smtp_accounts', '0006_remove_weight'),
    ]

    operations = [
        migrations.AddField(
            model_name='campaign',
            name='smtp_accounts',
            field=models.ManyToManyField(
                blank=True, related_name='campaigns', to='smtp_accounts.smtpaccount'
            ),
        ),
    ]
