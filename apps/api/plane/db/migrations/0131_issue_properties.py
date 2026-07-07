# Custom Fields / Work Item Properties — mote (Phase 1).
# See docs/mote-design/03-work-item-power.md, section 1.
#
# Adds three net-new tables (IssueProperty, IssuePropertyOption,
# IssuePropertyValue). No changes to any existing table. Additive only.
# Table names mirror Plane EE (issue_properties, issue_property_options,
# issue_property_values) to ease future upstream merges. The value table is
# created now for use in Phase 2 (no value endpoints ship in Phase 1).

import django.contrib.postgres.fields
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0130_issueworklog_issuetimer"),
    ]

    operations = [
        migrations.CreateModel(
            name="IssueProperty",
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
                ("display_name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                (
                    "property_type",
                    models.CharField(
                        choices=[
                            ("TEXT", "Text"),
                            ("NUMBER", "Number"),
                            ("SELECT", "Select"),
                            ("MULTI_SELECT", "Multi Select"),
                            ("DATE", "Date"),
                            ("MEMBER", "Member"),
                            ("BOOLEAN", "Boolean"),
                            ("URL", "URL"),
                        ],
                        max_length=30,
                    ),
                ),
                ("relation_type", models.CharField(blank=True, max_length=30, null=True)),
                ("is_required", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("is_multi", models.BooleanField(default=False)),
                (
                    "default_value",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(),
                        blank=True,
                        default=list,
                        size=None,
                    ),
                ),
                ("settings", models.JSONField(default=dict)),
                ("sort_order", models.FloatField(default=65535)),
                ("external_source", models.CharField(blank=True, max_length=255, null=True)),
                ("external_id", models.CharField(blank=True, max_length=255, null=True)),
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
                    "issue_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="properties",
                        to="db.issuetype",
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
                "verbose_name": "Issue Property",
                "verbose_name_plural": "Issue Properties",
                "db_table": "issue_properties",
                "ordering": ("sort_order",),
                "unique_together": {("issue_type", "name", "deleted_at")},
            },
        ),
        migrations.CreateModel(
            name="IssuePropertyOption",
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
                ("sort_order", models.FloatField(default=65535)),
                ("is_active", models.BooleanField(default=True)),
                ("is_default", models.BooleanField(default=False)),
                ("external_source", models.CharField(blank=True, max_length=255, null=True)),
                ("external_id", models.CharField(blank=True, max_length=255, null=True)),
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
                    "parent",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="children",
                        to="db.issuepropertyoption",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="options",
                        to="db.issueproperty",
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
                "verbose_name": "Issue Property Option",
                "verbose_name_plural": "Issue Property Options",
                "db_table": "issue_property_options",
                "ordering": ("sort_order",),
            },
        ),
        migrations.CreateModel(
            name="IssuePropertyValue",
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
                ("value_text", models.TextField(blank=True, null=True)),
                (
                    "value_decimal",
                    models.DecimalField(
                        blank=True, decimal_places=6, max_digits=20, null=True
                    ),
                ),
                ("value_datetime", models.DateTimeField(blank=True, null=True)),
                ("value_boolean", models.BooleanField(null=True)),
                ("value_uuid", models.UUIDField(null=True)),
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
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="property_values",
                        to="db.issue",
                    ),
                ),
                (
                    "property",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="values",
                        to="db.issueproperty",
                    ),
                ),
                (
                    "value_option",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="value_entries",
                        to="db.issuepropertyoption",
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
                "verbose_name": "Issue Property Value",
                "verbose_name_plural": "Issue Property Values",
                "db_table": "issue_property_values",
            },
        ),
        migrations.AddConstraint(
            model_name="issueproperty",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("issue_type", "name"),
                name="issue_property_unique_type_name_when_deleted_at_null",
            ),
        ),
        migrations.AddIndex(
            model_name="issuepropertyvalue",
            index=models.Index(
                fields=["issue", "property"], name="issue_prop_value_issue_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="issuepropertyvalue",
            index=models.Index(
                fields=["property", "value_uuid"], name="issue_prop_value_uuid_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="issuepropertyvalue",
            index=models.Index(
                fields=["property", "value_option"], name="issue_prop_value_option_idx"
            ),
        ),
    ]
