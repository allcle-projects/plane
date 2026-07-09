# Teamspaces P3 (mote) — team-scoped views and pages.
# Adds a nullable ``team`` FK to IssueView and Page so a Teamspace can own its
# own saved views and wiki pages. Both fields are nullable, so every existing
# view/page is unaffected. The unrelated issuetimer constraint churn that
# makemigrations emits (a pre-existing model/DB drift) is intentionally omitted.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0142_custom_rbac'),
    ]

    operations = [
        migrations.AddField(
            model_name='issueview',
            name='team',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='views', to='db.team'),
        ),
        migrations.AddField(
            model_name='page',
            name='team',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='pages', to='db.team'),
        ),
    ]
