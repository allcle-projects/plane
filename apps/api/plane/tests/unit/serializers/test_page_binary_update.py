# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
from unittest.mock import Mock

import pytest
from rest_framework import serializers

from plane.app.serializers.page import (
    PageBinaryUpdateSerializer,
    PageCommentSerializer,
)


@pytest.mark.unit
class TestPageBinaryUpdateSerializer:
    """
    `PageBinaryUpdateSerializer` is a plain `serializers.Serializer`, so DRF
    cannot derive `update()` for it. Without an explicit one, `serializer.save()`
    raises `NotImplementedError` and *every* page description save returns 500.
    """

    def test_update_is_implemented(self):
        assert "update" in PageBinaryUpdateSerializer.__dict__, (
            "PageBinaryUpdateSerializer must define update(); "
            "serializers.Serializer has no model to derive it from."
        )

    def test_save_writes_all_description_fields(self):
        page = Mock()
        serializer = PageBinaryUpdateSerializer(
            page,
            data={"description_html": "<p>hello</p>", "description_json": {"type": "doc"}},
            partial=True,
        )

        assert serializer.is_valid(), serializer.errors
        serializer.save()

        assert page.description_html == "<p>hello</p>"
        assert page.description_json == {"type": "doc"}
        page.save.assert_called_once()

    def test_save_leaves_untouched_fields_alone(self):
        page = Mock()
        page.description_json = {"original": True}

        serializer = PageBinaryUpdateSerializer(page, data={"description_html": "<p>x</p>"}, partial=True)
        assert serializer.is_valid(), serializer.errors
        serializer.save()

        assert page.description_json == {"original": True}

    def test_description_binary_is_base64_decoded(self):
        # validate_binary_data rejects anything shorter than 4 bytes.
        raw = b"\x00\x01\x02\x03\x04\x05\x06\x07"
        page = Mock()

        serializer = PageBinaryUpdateSerializer(
            page,
            data={"description_binary": base64.b64encode(raw).decode()},
            partial=True,
        )

        assert serializer.is_valid(), serializer.errors
        serializer.save()
        assert page.description_binary == raw

    def test_too_short_binary_is_rejected(self):
        serializer = PageBinaryUpdateSerializer(
            Mock(),
            data={"description_binary": base64.b64encode(b"\x01\x02").decode()},
            partial=True,
        )

        assert not serializer.is_valid()
        assert "description_binary" in serializer.errors

    def test_invalid_base64_is_rejected_not_saved(self):
        serializer = PageBinaryUpdateSerializer(Mock(), data={"description_binary": "!!not base64!!"}, partial=True)

        assert not serializer.is_valid()
        assert "description_binary" in serializer.errors

    def test_html_is_validated(self):
        """The validators exist on this serializer, so HTML sanitisation runs on save."""
        assert "validate_description_html" in PageBinaryUpdateSerializer.__dict__
        assert "validate_description_binary" in PageBinaryUpdateSerializer.__dict__


@pytest.mark.unit
class TestPageCommentSerializerHasNoPageDescriptionLogic:
    """
    These three methods belong to `PageBinaryUpdateSerializer`. When they sat on
    `PageCommentSerializer` instead, its `update()` override shadowed
    `ModelSerializer.update()` and only ever looked for `description_*` keys —
    which `PageComment` does not have — so editing a page comment silently saved
    nothing.
    """

    @pytest.mark.parametrize(
        "method",
        ["update", "validate_description_binary", "validate_description_html"],
    )
    def test_page_description_methods_are_not_defined_here(self, method):
        assert method not in PageCommentSerializer.__dict__

    def test_update_falls_through_to_model_serializer(self):
        assert PageCommentSerializer.update is serializers.ModelSerializer.update
