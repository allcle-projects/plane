# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from unittest.mock import Mock

import pytest

from plane.middleware.logger import (
    API_KEY_HEADER,
    MAX_LOGGED_BODY_BYTES,
    APITokenLogMiddleware,
)


@pytest.fixture
def middleware():
    return APITokenLogMiddleware(get_response=Mock())


@pytest.mark.unit
class TestAuditLogBodyCap:
    """
    An uncapped body is copied into the celery message twice (log_data +
    mongo_log), so one large API payload could exceed RabbitMQ's max message
    size. That publish fails with PRECONDITION_FAILED (406) and kills the AMQP
    channel, which then surfaces as a 500 on the next unrelated request sharing
    the connection. The cap is what keeps that from happening.
    """

    def test_small_body_is_logged_verbatim(self, middleware):
        assert middleware._safe_decode_body(b"hello") == "hello"

    def test_oversized_body_is_truncated(self, middleware):
        original_size = MAX_LOGGED_BODY_BYTES * 3
        decoded = middleware._safe_decode_body(b"a" * original_size)

        assert len(decoded) < original_size
        assert decoded.startswith("a" * 100)
        assert f"truncated: {original_size} bytes total" in decoded

    def test_truncation_survives_a_cut_through_a_multibyte_character(self, middleware):
        # "가" is 3 bytes in UTF-8, so the cut lands mid-character.
        body = "가".encode("utf-8") * MAX_LOGGED_BODY_BYTES

        decoded = middleware._safe_decode_body(body)

        assert "truncated" in decoded
        assert decoded != "[Could not decode content]"

    def test_undecodable_short_body_still_reports_plainly(self, middleware):
        assert middleware._safe_decode_body(b"\xff\xfe\x00") == "[Could not decode content]"

    def test_binary_signatures_short_circuit(self, middleware):
        assert middleware._safe_decode_body(b"%PDF-1.7 ...") == "[Binary Content]"

    def test_empty_body_is_none(self, middleware):
        assert middleware._safe_decode_body(b"") is None
        assert middleware._safe_decode_body(None) is None


@pytest.mark.unit
class TestAuditLogResponseBody:
    def test_streaming_response_is_not_consumed(self, middleware):
        # StreamingHttpResponse has no `.content`; reading it raises.
        response = Mock(spec=["streaming"])
        response.streaming = True

        assert middleware._response_body(response) == "[Streaming Content]"

    def test_regular_response_body_is_read(self, middleware):
        response = Mock()
        response.streaming = False
        response.content = b"ok"

        assert middleware._response_body(response) == "ok"

    def test_empty_response_body_is_none(self, middleware):
        response = Mock()
        response.streaming = False
        response.content = b""

        assert middleware._response_body(response) is None


@pytest.mark.unit
class TestAuditLogHeaderRedaction:
    def test_api_key_is_redacted(self, middleware):
        request = Mock()
        request.headers = {API_KEY_HEADER: "plane_api_secret", "Host": "plane.example.com"}

        headers = middleware._safe_headers(request)

        assert "plane_api_secret" not in headers
        assert "[REDACTED]" in headers
        assert "plane.example.com" in headers

    def test_api_key_is_redacted_case_insensitively(self, middleware):
        request = Mock()
        request.headers = {"x-api-key": "plane_api_secret"}

        assert "plane_api_secret" not in middleware._safe_headers(request)
