from django.db import migrations, models

# NOTE: the issuetimer one_running_timer_per_user_issue Remove/Add-constraint
# ops that makemigrations drags in (pre-existing model<->migration drift since
# mote.9) are intentionally stripped from this feature migration, same as
# 0141/0142. Only the actual schema change (IssueView.column_order) is kept.


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0144_teamspace_public"),
    ]

    operations = [
        migrations.AddField(
            model_name="issueview",
            name="column_order",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
