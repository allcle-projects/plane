# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Custom Fields / Work Item Properties — mote (Phase 2).
# See docs/mote-design/03-work-item-power.md, section 1 (Phase 2).
#
# Pure (DRF-free) helpers for validating and normalizing IssuePropertyValue
# rows for the bulk-upsert endpoint, and for serializing stored rows back into
# the ``{property_id: [values]}`` shape the frontend consumes. Kept framework
# neutral so both the internal (app/) and public v1 (api/) views can reuse it
# without cross-importing each other's serializers.

# Python imports
from decimal import Decimal, InvalidOperation
from uuid import UUID

# Django imports
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.utils.dateparse import parse_date, parse_datetime

# Module imports
from plane.db.models import (
    PropertyTypeEnum,
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    WorkspaceMember,
)


class PropertyValueError(Exception):
    """Raised when a submitted value fails validation for its property.

    ``message`` is safe to surface to the client as a 400 body.
    """

    def __init__(self, message):
        self.message = message
        super().__init__(message)


def _decimal_key(value):
    """Fixed-point string form of a Decimal, used as a stable diff key."""
    text = format(Decimal(value), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _coerce_boolean(raw):
    if isinstance(raw, bool):
        return raw
    text = str(raw).strip().lower()
    if text in ("true", "1", "yes"):
        return True
    if text in ("false", "0", "no"):
        return False
    raise PropertyValueError(f"'{raw}' is not a valid boolean.")


def _coerce_uuid(raw):
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        raise PropertyValueError(f"'{raw}' is not a valid identifier.")


def normalize_value(issue_property, raw, member_ids, option_ids):
    """Validate one raw value against a property definition.

    Returns ``(key, column_kwargs)`` where ``key`` is a stable string used to
    diff against existing rows and ``column_kwargs`` is the typed-column
    assignment for creating an ``IssuePropertyValue`` row. Raises
    ``PropertyValueError`` on invalid input.
    """
    property_type = issue_property.property_type
    settings = issue_property.settings or {}

    if property_type in (PropertyTypeEnum.TEXT, PropertyTypeEnum.URL):
        text = "" if raw is None else str(raw)
        if property_type == PropertyTypeEnum.URL:
            try:
                URLValidator()(text)
            except DjangoValidationError:
                raise PropertyValueError(f"'{raw}' is not a valid URL.")
        return text, {"value_text": text}

    if property_type == PropertyTypeEnum.NUMBER:
        try:
            number = Decimal(str(raw))
        except (InvalidOperation, ValueError, TypeError):
            raise PropertyValueError(f"'{raw}' is not a valid number.")
        minimum = settings.get("min")
        maximum = settings.get("max")
        if isinstance(minimum, (int, float)) and number < Decimal(str(minimum)):
            raise PropertyValueError(f"'{raw}' is below the minimum ({minimum}).")
        if isinstance(maximum, (int, float)) and number > Decimal(str(maximum)):
            raise PropertyValueError(f"'{raw}' is above the maximum ({maximum}).")
        return _decimal_key(number), {"value_decimal": number}

    if property_type == PropertyTypeEnum.DATE:
        parsed = parse_datetime(str(raw))
        if parsed is None:
            parsed_date = parse_date(str(raw))
            if parsed_date is None:
                raise PropertyValueError(f"'{raw}' is not a valid date.")
            from datetime import datetime

            parsed = datetime(parsed_date.year, parsed_date.month, parsed_date.day)
        return parsed.isoformat(), {"value_datetime": parsed}

    if property_type == PropertyTypeEnum.BOOLEAN:
        boolean = _coerce_boolean(raw)
        return ("true" if boolean else "false"), {"value_boolean": boolean}

    if property_type == PropertyTypeEnum.MEMBER:
        member_uuid = _coerce_uuid(raw)
        if str(member_uuid) not in member_ids:
            raise PropertyValueError(f"'{raw}' is not an active member of this workspace.")
        return str(member_uuid), {"value_uuid": member_uuid}

    if property_type in (PropertyTypeEnum.SELECT, PropertyTypeEnum.MULTI_SELECT):
        option_uuid = _coerce_uuid(raw)
        if str(option_uuid) not in option_ids:
            raise PropertyValueError(f"'{raw}' is not a valid option for this property.")
        return str(option_uuid), {"value_option_id": option_uuid}

    raise PropertyValueError(f"Unsupported property type '{property_type}'.")


def normalize_values(issue_property, raw_values, member_ids, option_ids):
    """Validate a list of raw values for one property.

    Enforces required + multi/single cardinality. Returns a list of
    ``(key, column_kwargs)`` tuples (de-duplicated, order preserved).
    """
    if raw_values is None:
        raw_values = []
    if not isinstance(raw_values, (list, tuple)):
        raise PropertyValueError(
            f"Values for '{issue_property.display_name}' must be a list."
        )

    allows_multiple = (
        issue_property.property_type == PropertyTypeEnum.MULTI_SELECT
        or issue_property.is_multi
    )
    if not allows_multiple and len(raw_values) > 1:
        raise PropertyValueError(
            f"'{issue_property.display_name}' accepts a single value."
        )

    normalized = []
    seen = set()
    for raw in raw_values:
        key, column_kwargs = normalize_value(
            issue_property, raw, member_ids, option_ids
        )
        if key in seen:
            continue
        seen.add(key)
        normalized.append((key, column_kwargs))

    if issue_property.is_required and not normalized:
        raise PropertyValueError(
            f"'{issue_property.display_name}' is required."
        )

    return normalized


def value_row_key(row):
    """Stable string key for an existing IssuePropertyValue row (for diffing)."""
    property_type = row.property.property_type
    if property_type in (PropertyTypeEnum.TEXT, PropertyTypeEnum.URL):
        return row.value_text or ""
    if property_type == PropertyTypeEnum.NUMBER:
        return _decimal_key(row.value_decimal) if row.value_decimal is not None else ""
    if property_type == PropertyTypeEnum.DATE:
        return row.value_datetime.isoformat() if row.value_datetime else ""
    if property_type == PropertyTypeEnum.BOOLEAN:
        if row.value_boolean is None:
            return ""
        return "true" if row.value_boolean else "false"
    if property_type == PropertyTypeEnum.MEMBER:
        return str(row.value_uuid) if row.value_uuid else ""
    if property_type in (PropertyTypeEnum.SELECT, PropertyTypeEnum.MULTI_SELECT):
        return str(row.value_option_id) if row.value_option_id else ""
    return ""


def value_row_to_str(row):
    """Client-facing string form of a stored row (same as its diff key here)."""
    return value_row_key(row)


def serialize_property_values(rows):
    """Group prefetched IssuePropertyValue rows into ``{property_id: [values]}``.

    ``rows`` must be an iterable of IssuePropertyValue with ``property`` loaded
    (use ``prefetch_related("property_values", "property_values__property")``).
    """
    grouped = {}
    for row in rows:
        grouped.setdefault(str(row.property_id), []).append(value_row_to_str(row))
    return grouped


def get_issue_property_values(issue):
    """Read the current ``{property_id: [values]}`` map for an issue."""
    rows = IssuePropertyValue.objects.filter(issue_id=issue.id).select_related(
        "property"
    )
    return serialize_property_values(rows)


def upsert_property_values(issue, payload):
    """Bulk-upsert property values for an issue.

    ``payload`` is ``{property_id: [values]}``. For each property present, the
    submitted values are validated and diffed against the issue's existing
    rows; unchanged rows are left untouched, obsolete rows are soft-deleted and
    new values are created (multi-value = N rows).

    Returns ``(result_map, changes)`` where ``result_map`` is the full current
    ``{property_id: [values]}`` after the upsert and ``changes`` is a list of
    ``{property_id, property_name, property_type, old_values, new_values, verb}``
    descriptors the caller can turn into IssueActivity rows. Raises
    ``PropertyValueError`` on any invalid input (nothing is written).
    """
    if not isinstance(payload, dict) or not payload:
        raise PropertyValueError("Request body must be a non-empty object of {property_id: [values]}.")

    if issue.type_id is None:
        raise PropertyValueError("This work item has no type; it cannot hold custom properties.")

    # Resolve + authorize each property id against the issue's work item type.
    property_ids = list(payload.keys())
    properties = {
        str(prop.id): prop
        for prop in IssueProperty.objects.filter(
            id__in=property_ids,
            issue_type_id=issue.type_id,
            is_active=True,
        )
    }
    for property_id in property_ids:
        if str(property_id) not in properties:
            raise PropertyValueError(
                f"'{property_id}' is not an active property of this work item's type."
            )

    # Shared lookup sets for MEMBER / option validation.
    member_ids = set(
        str(mid)
        for mid in WorkspaceMember.objects.filter(
            workspace_id=issue.workspace_id, is_active=True
        ).values_list("member_id", flat=True)
    )
    option_ids_by_property = {}
    for property_id, prop in properties.items():
        if prop.property_type in (
            PropertyTypeEnum.SELECT,
            PropertyTypeEnum.MULTI_SELECT,
        ):
            option_ids_by_property[property_id] = set(
                str(oid)
                for oid in IssuePropertyOption.objects.filter(
                    property_id=prop.id, is_active=True
                ).values_list("id", flat=True)
            )
        else:
            option_ids_by_property[property_id] = set()

    # Validate everything up front so an invalid payload writes nothing.
    normalized_by_property = {}
    for property_id, prop in properties.items():
        normalized_by_property[property_id] = normalize_values(
            prop,
            payload.get(property_id),
            member_ids,
            option_ids_by_property[property_id],
        )

    changes = []
    for property_id, prop in properties.items():
        desired = normalized_by_property[property_id]  # list of (key, column_kwargs)
        desired_keys = [key for key, _ in desired]

        existing_rows = list(
            IssuePropertyValue.objects.filter(
                issue_id=issue.id, property_id=prop.id
            ).select_related("property")
        )
        existing_by_key = {}
        for row in existing_rows:
            existing_by_key.setdefault(value_row_key(row), row)

        old_values = [value_row_key(row) for row in existing_rows]

        # Delete rows no longer desired.
        for key, row in existing_by_key.items():
            if key not in desired_keys:
                row.delete()  # soft-delete (deleted_at)

        # Create rows for newly desired values.
        for key, column_kwargs in desired:
            if key in existing_by_key:
                continue
            IssuePropertyValue.objects.create(
                workspace_id=issue.workspace_id,
                project_id=issue.project_id,
                issue_id=issue.id,
                property_id=prop.id,
                **column_kwargs,
            )

        if old_values != desired_keys:
            if not old_values:
                verb = "created"
            elif not desired_keys:
                verb = "deleted"
            else:
                verb = "updated"
            changes.append(
                {
                    "property_id": str(prop.id),
                    "property_name": prop.display_name,
                    "property_type": prop.property_type,
                    "old_values": old_values,
                    "new_values": desired_keys,
                    "verb": verb,
                }
            )

    return get_issue_property_values(issue), changes
