# Teamspaces P4 (mote) — public teamspace flag.
# Adds a boolean ``is_public`` to Team; when true, the team's public pages are
# readable anonymously via the public teamspace endpoint. Default false, so all
# existing teams stay private. The unrelated issuetimer constraint churn that
# makemigrations emits (a pre-existing model/DB drift) is intentionally omitted.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0143_teamspace_views_pages'),
    ]

    operations = [
        migrations.AddField(
            model_name='team',
            name='is_public',
            field=models.BooleanField(default=False),
        ),
    ]
