from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sequences', '0004_sequence_schedule_days_sequence_schedule_enabled_and_more'),
        ('contacts', '0001_initial'),
        ('email_templates', '0001_initial'),
        ('smtp_accounts', '0001_initial'),
        # analytics.SendLog.sequence_step has a literal 'sequences.sequencestep'
        # lazy reference baked into this already-applied migration — it must
        # run (and resolve against the old name) before this rename, or
        # project-state replay ends up with a dangling lazy reference.
        ('analytics', '0003_sendlog_sequence_step_alter_sendlog_campaign'),
    ]

    operations = [
        # Data-preserving renames — these keep the existing rows (RenameModel
        # / RenameField, NOT DeleteModel+CreateModel).
        migrations.RenameModel(old_name='Sequence', new_name='Campaign'),
        migrations.RenameModel(old_name='SequenceStep', new_name='CampaignStep'),
        migrations.RenameModel(old_name='SequenceEnrollment', new_name='CampaignEnrollment'),
        migrations.RenameModel(old_name='SequenceSMTPRoute', new_name='CampaignSMTPRoute'),

        migrations.RenameField(model_name='campaignstep', old_name='sequence', new_name='campaign'),
        migrations.RenameField(model_name='campaignenrollment', old_name='sequence', new_name='campaign'),
        migrations.RenameField(model_name='campaignsmtproute', old_name='sequence', new_name='campaign'),

        # Cosmetic-only changes (related_name / ordering / unique_together) —
        # no column rename, just bringing migration state in line with the
        # renamed model fields above.
        migrations.AlterField(
            model_name='campaign',
            name='user',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='campaigns', to='accounts.user'),
        ),
        migrations.AlterField(
            model_name='campaign',
            name='contact_lists',
            field=models.ManyToManyField(related_name='campaigns', to='contacts.contactlist'),
        ),
        migrations.AlterField(
            model_name='campaignstep',
            name='template',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='campaign_steps', to='email_templates.emailtemplate'),
        ),
        migrations.AlterField(
            model_name='campaignenrollment',
            name='contact',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='campaign_enrollments', to='contacts.contact'),
        ),
        migrations.AlterField(
            model_name='campaignsmtproute',
            name='smtp_account',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='campaign_routes', to='smtp_accounts.smtpaccount'),
        ),

        migrations.AlterModelOptions(
            name='campaignstep',
            options={'ordering': ['campaign', 'order']},
        ),
        migrations.AlterUniqueTogether(
            name='campaignenrollment',
            unique_together={('campaign', 'contact')},
        ),
        migrations.AlterUniqueTogether(
            name='campaignsmtproute',
            unique_together={('campaign', 'smtp_account')},
        ),
    ]
