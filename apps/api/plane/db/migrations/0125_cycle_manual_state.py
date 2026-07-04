# Cycle manual Start/Stop + Auto-schedule (mote) — see
# docs/mote-design/01-estimates-cycles.md, Feature 2.

from django.db import migrations, models
from django.utils import timezone


def backfill_cycle_state(apps, schema_editor):
    """
    Seed the new manual `state` from the existing date-based status logic so
    existing cycles keep their computed status:
        start <= now <= end  -> current
        end < now            -> completed  (seed completed_at = end_date)
        start > now          -> upcoming
        else                 -> draft
    Also seed started_at = start_date for cycles that have a start_date.
    """
    Cycle = apps.get_model("db", "Cycle")
    now = timezone.now()

    for cycle in Cycle.objects.all().iterator():
        start_date = cycle.start_date
        end_date = cycle.end_date

        if start_date is not None and end_date is not None and start_date <= now <= end_date:
            cycle.state = "current"
            cycle.started_at = start_date
        elif end_date is not None and end_date < now:
            cycle.state = "completed"
            cycle.started_at = start_date
            cycle.completed_at = end_date
        elif start_date is not None and start_date > now:
            cycle.state = "upcoming"
        else:
            cycle.state = "draft"

        cycle.save(update_fields=["state", "started_at", "completed_at"])


def reverse_backfill(apps, schema_editor):
    # No-op: the columns are dropped on reverse by the schema operations.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0124_search_trigram_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="cycle",
            name="state",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("upcoming", "Upcoming"),
                    ("current", "Current"),
                    ("completed", "Completed"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="cycle",
            name="started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cycle",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cycle",
            name="auto_schedule",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_cycle_state, reverse_backfill),
    ]
