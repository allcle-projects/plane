# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import io
import zipfile
from typing import List
import boto3
from botocore.client import Config
from uuid import UUID

# Third party imports
from celery import shared_task

# Django imports
from django.conf import settings
from django.utils import timezone
from django.db.models import Prefetch

# Module imports
from plane.db.models import ExporterHistory, Issue, IssueComment, IssueRelation, IssueSubscriber
from plane.utils.exception_logger import log_exception
from plane.utils.porters.exporter import DataExporter
from plane.utils.porters.serializers.issue import IssueExportSerializer

# Table/DB view (mote) — view-aware CSV export, docs/mote-design/12 Phase 2.
# Maps frontend SPREADSHEET_PROPERTY_LIST keys (IssueView.column_order /
# display_properties, see packages/constants/src/issue/common.ts) to the
# corresponding IssueExportSerializer output field(s). A frontend key may map
# to more than one export column (e.g. "assignee" -> both a name list and,
# implicitly, nothing else — kept 1:1 here since the export serializer already
# collapses to single human-readable fields).
VIEW_COLUMN_TO_EXPORT_FIELD = {
    "state": "state_name",
    "priority": "priority",
    "assignee": "assignees",
    "labels": "labels",
    "modules": "modules",
    "cycle": "cycles",
    "start_date": "start_date",
    "due_date": "target_date",
    "estimate": "estimate",
    "created_on": "created_at",
    "updated_on": "updated_at",
    "link": "links",
    "attachment_count": "attachment_count",
    "sub_issue_count": "sub_issues_count",
}

# Columns always kept regardless of column_order — identifying/core fields
# that would make the export useless if silently dropped.
ALWAYS_INCLUDED_EXPORT_FIELDS = ["project_name", "project_identifier", "identifier", "name"]


def _apply_column_order(rows: list, column_order: list | None) -> list:
    """Reorder/subset serialized export rows per a view's column_order. Unknown
    frontend keys are silently skipped (same tolerance as the frontend's own
    fallback-to-default-order behavior) rather than raising, since column_order
    is user data, not a trusted schema."""
    if not column_order:
        return rows

    ordered_fields = list(ALWAYS_INCLUDED_EXPORT_FIELDS)
    for key in column_order:
        export_field = VIEW_COLUMN_TO_EXPORT_FIELD.get(key)
        if export_field and export_field not in ordered_fields:
            ordered_fields.append(export_field)

    if len(ordered_fields) <= len(ALWAYS_INCLUDED_EXPORT_FIELDS):
        # column_order had no recognizable columns -- export everything rather
        # than an empty/near-empty file.
        return rows

    return [{field: row.get(field, "") for field in ordered_fields} for row in rows]


def create_zip_file(files: List[tuple[str, str | bytes]]) -> io.BytesIO:
    """
    Create a ZIP file from the provided files.
    """
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for filename, file_content in files:
            zipf.writestr(filename, file_content)

    zip_buffer.seek(0)
    return zip_buffer


# TODO: Change the upload_to_s3 function to use the new storage method with entry in file asset table
def upload_to_s3(zip_file: io.BytesIO, workspace_id: UUID, token_id: str, slug: str) -> None:
    """
    Upload a ZIP file to S3 and generate a presigned URL.
    """
    file_name = f"{workspace_id}/export-{slug}-{token_id[:6]}-{str(timezone.now().date())}.zip"
    expires_in = 7 * 24 * 60 * 60

    if settings.USE_MINIO:
        upload_s3 = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
        )
        upload_s3.upload_fileobj(
            zip_file,
            settings.AWS_STORAGE_BUCKET_NAME,
            file_name,
            ExtraArgs={"ACL": "public-read", "ContentType": "application/zip"},
        )

        # Generate presigned url for the uploaded file with different base
        presign_s3 = boto3.client(
            "s3",
            endpoint_url=(
                f"{settings.AWS_S3_URL_PROTOCOL}//{str(settings.AWS_S3_CUSTOM_DOMAIN).replace('/uploads', '')}/"
            ),
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
        )

        presigned_url = presign_s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": file_name},
            ExpiresIn=expires_in,
        )
    else:
        # If endpoint url is present, use it
        if settings.AWS_S3_ENDPOINT_URL:
            s3 = boto3.client(
                "s3",
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                config=Config(signature_version="s3v4"),
            )
        else:
            s3 = boto3.client(
                "s3",
                region_name=settings.AWS_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                config=Config(signature_version="s3v4"),
            )

        # Upload the file to S3
        s3.upload_fileobj(
            zip_file,
            settings.AWS_STORAGE_BUCKET_NAME,
            file_name,
            ExtraArgs={"ContentType": "application/zip"},
        )

        # Generate presigned url for the uploaded file
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_STORAGE_BUCKET_NAME, "Key": file_name},
            ExpiresIn=expires_in,
        )

    exporter_instance = ExporterHistory.objects.get(token=token_id)

    # Update the exporter instance with the presigned url
    if presigned_url:
        exporter_instance.url = presigned_url
        exporter_instance.status = "completed"
        exporter_instance.key = file_name
    else:
        exporter_instance.status = "failed"

    exporter_instance.save(update_fields=["status", "url", "key"])


@shared_task
def issue_export_task(
    provider: str,
    workspace_id: UUID,
    project_ids: List[str],
    token_id: str,
    multiple: bool,
    slug: str,
    view_query: dict | None = None,
    column_order: list | None = None,
):
    """
    Export issues from the workspace.
    provider (str): The provider to export the issues to csv | json | xlsx.
    token_id (str): The export object token id.
    multiple (bool): Whether to export the issues to multiple files per project.
    """
    try:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "processing"
        exporter_instance.save(update_fields=["status"])

        # Build base queryset for issues
        workspace_issues = (
            Issue.objects.filter(
                workspace__id=workspace_id,
                project_id__in=project_ids,
                project__project_projectmember__member=exporter_instance.initiated_by_id,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related(
                "project",
                "workspace",
                "state",
                "created_by",
                "estimate_point",
            )
            .prefetch_related(
                "labels",
                "issue_cycle__cycle",
                "issue_module__module",
                "assignees",
                "issue_link",
                Prefetch(
                    "issue_subscribers",
                    queryset=IssueSubscriber.objects.select_related("subscriber"),
                ),
                Prefetch(
                    "issue_comments",
                    queryset=IssueComment.objects.select_related("actor").order_by("created_at"),
                ),
                Prefetch(
                    "issue_relation",
                    queryset=IssueRelation.objects.select_related("related_issue", "related_issue__project"),
                ),
                Prefetch(
                    "issue_related",
                    queryset=IssueRelation.objects.select_related("issue", "issue__project"),
                ),
                Prefetch(
                    "parent",
                    queryset=Issue.objects.select_related("type", "project"),
                ),
            )
        )

        # Table/DB view (mote) — apply the saved view's filters (already
        # computed into Q-filter form as IssueView.query at save-time via
        # issue_filters()). No-op when exporting without a view.
        if view_query:
            workspace_issues = workspace_issues.filter(**view_query)

        # Create exporter for the specified format
        try:
            exporter = DataExporter(IssueExportSerializer, format_type=provider)
        except ValueError as e:
            # Invalid format type
            exporter_instance = ExporterHistory.objects.get(token=token_id)
            exporter_instance.status = "failed"
            exporter_instance.reason = str(e)
            exporter_instance.save(update_fields=["status", "reason"])
            return

        files = []
        if multiple:
            # Export each project separately with its own queryset
            for project_id in project_ids:
                project_issues = workspace_issues.filter(project_id=project_id)
                export_filename = f"{slug}-{project_id}"
                rows = _apply_column_order(exporter.serialize(project_issues), column_order)
                content_bytes = exporter.formatter.encode(rows)
                filename = f"{export_filename}.{exporter.formatter.extension}"
                files.append((filename, content_bytes))
        else:
            # Export all issues in a single file
            export_filename = f"{slug}-{workspace_id}"
            rows = _apply_column_order(exporter.serialize(workspace_issues), column_order)
            content_bytes = exporter.formatter.encode(rows)
            filename = f"{export_filename}.{exporter.formatter.extension}"
            files.append((filename, content_bytes))

        zip_buffer = create_zip_file(files)
        upload_to_s3(zip_buffer, workspace_id, token_id, slug)

    except Exception as e:
        exporter_instance = ExporterHistory.objects.get(token=token_id)
        exporter_instance.status = "failed"
        exporter_instance.reason = str(e)
        exporter_instance.save(update_fields=["status", "reason"])
        log_exception(e)
        return
