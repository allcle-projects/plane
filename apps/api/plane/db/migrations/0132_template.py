# Templates (work item + project templates) — mote.
# See docs/mote-design/03-work-item-power.md, section 2.
#
# Adds one net-new table (Template). No changes to any existing table.
# Additive only. Table name mirrors Plane EE (templates) to ease future
# upstream merges.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0131_issue_properties"),
    ]

    operations = [
        migrations.CreateModel(
            name="Template",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                (
                    "template_type",
                    models.CharField(
                        choices=[
                            ("work_item", "Work Item"),
                            ("project", "Project"),
                        ],
                        max_length=30,
                    ),
                ),
                ("template_data", models.JSONField(default=dict)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Template",
                "verbose_name_plural": "Templates",
                "db_table": "templates",
                "ordering": ("-created_at",),
                "unique_together": {("workspace", "name", "template_type", "deleted_at")},
            },
        ),
        migrations.AddConstraint(
            model_name="template",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name", "template_type"),
                name="template_unique_name_type_per_workspace_when_deleted_at_null",
            ),
        ),
    ]
