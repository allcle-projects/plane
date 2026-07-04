# Enhanced / Semantic Search (Option A: pg_trgm) — see
# docs/mote-design/06-integrations-importers-automations.md, Feature 4.

from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import AddIndexConcurrently, TrigramExtension
from django.db import migrations


class Migration(migrations.Migration):
    # CONCURRENTLY index builds cannot run inside a transaction.
    atomic = False

    dependencies = [
        ("db", "0123_estimate_time_type"),
    ]

    operations = [
        # Enable pg_trgm so gin_trgm_ops opclass + similarity() are available.
        TrigramExtension(),
        AddIndexConcurrently(
            model_name="issue",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="issue_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="project",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="project_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="project",
            index=GinIndex(fields=["identifier"], opclasses=["gin_trgm_ops"], name="project_ident_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="cycle",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="cycle_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="module",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="module_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="page",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="page_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="issueview",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="view_name_trgm_idx"),
        ),
        AddIndexConcurrently(
            model_name="workspace",
            index=GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="workspace_name_trgm_idx"),
        ),
    ]
