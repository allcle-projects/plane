# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
import time

# Django imports
from django.http import HttpRequest
from django.utils import timezone

# Third party imports
from rest_framework.request import Request

# Module imports
from plane.utils.ip_address import get_client_ip
from plane.utils.exception_logger import log_exception
from plane.bgtasks.logger_task import process_logs

api_logger = logging.getLogger("plane.api.request")

# Upper bound on how much of a request/response body is copied into the audit
# log. Each celery message carries the body twice (log_data + mongo_log), so an
# uncapped body is published to RabbitMQ at ~2x its size. A single oversized
# publish is rejected with `PRECONDITION_FAILED (406)` and takes the whole AMQP
# channel down with it, which then surfaces as a 500 on the *next* unrelated
# request that shares the connection (e.g. `recent_visited_task.delay()` while
# opening a project or page). Capping here keeps one big API payload from
# breaking web navigation for everyone.
MAX_LOGGED_BODY_BYTES = 64 * 1024

# Header whose value is the raw API token; never copy it into the audit log.
API_KEY_HEADER = "X-Api-Key"


class RequestLoggerMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def _should_log_route(self, request: Request | HttpRequest) -> bool:
        """
        Determines whether a route should be logged based on the request and status code.
        """
        # Don't log health checks
        if request.path == "/" and request.method == "GET":
            return False
        return True

    def __call__(self, request):
        # get the start time
        start_time = time.time()

        # Get the response
        response = self.get_response(request)

        # calculate the duration
        duration = time.time() - start_time

        # Check if logging is required
        log_true = self._should_log_route(request=request)

        # If logging is not required, return the response
        if not log_true:
            return response

        user_id = (
            request.user.id if getattr(request, "user") and getattr(request.user, "is_authenticated", False) else None
        )

        user_agent = request.META.get("HTTP_USER_AGENT", "")

        # Log the request information
        api_logger.info(
            f"{request.method} {request.get_full_path()} {response.status_code}",
            extra={
                "path": request.path,
                "method": request.method,
                "status_code": response.status_code,
                "duration_ms": int(duration * 1000),
                "remote_addr": get_client_ip(request),
                "user_agent": user_agent,
                "user_id": user_id,
            },
        )

        # return the response
        return response


class APITokenLogMiddleware:
    """
    Middleware to log External API requests to MongoDB or PostgreSQL.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_body = request.body
        response = self.get_response(request)
        self.process_request(request, response, request_body)
        return response

    def _safe_decode_body(self, content):
        """
        Safely decodes request/response body content, handling binary data.
        Returns None if content is None, or a string representation of the content.
        """
        # If the content is None, return None
        if content is None:
            return None

        # If the content is an empty bytes object, return None
        if content == b"":
            return None

        # Check if content is binary by looking for common binary file signatures
        if content.startswith(b"\x89PNG") or content.startswith(b"\xff\xd8\xff") or content.startswith(b"%PDF"):
            return "[Binary Content]"

        original_size = len(content)
        truncated = original_size > MAX_LOGGED_BODY_BYTES
        if truncated:
            content = content[:MAX_LOGGED_BODY_BYTES]

        try:
            decoded = content.decode("utf-8")
        except UnicodeDecodeError:
            if not truncated:
                return "[Could not decode content]"
            # The cut may have landed mid-character; that alone shouldn't turn a
            # useful truncated body into "[Could not decode content]".
            decoded = content.decode("utf-8", errors="replace")

        if truncated:
            decoded += f"... [truncated: {original_size} bytes total, logged first {MAX_LOGGED_BODY_BYTES}]"
        return decoded

    def _response_body(self, response):
        """
        Returns the response body for logging, or a marker for responses whose
        body cannot be read without consuming it.
        """
        # StreamingHttpResponse (e.g. page description binary downloads) has no
        # `.content`; touching it raises AttributeError.
        if getattr(response, "streaming", False):
            return "[Streaming Content]"

        content = getattr(response, "content", None)
        return self._safe_decode_body(content) if content else None

    def _safe_headers(self, request):
        """
        Stringified request headers with the API token redacted.
        """
        headers = {}
        for key, value in request.headers.items():
            if key.lower() == API_KEY_HEADER.lower():
                headers[key] = "[REDACTED]"
            else:
                headers[key] = value
        return str(headers)

    def process_request(self, request, response, request_body):
        api_key = request.headers.get(API_KEY_HEADER)

        # If the API key is not present, return
        if not api_key:
            return

        try:
            log_data = {
                "token_identifier": api_key,
                "path": request.path,
                "method": request.method,
                "query_params": request.META.get("QUERY_STRING", ""),
                "headers": self._safe_headers(request),
                "body": self._safe_decode_body(request_body) if request_body else None,
                "response_body": self._response_body(response),
                "response_code": response.status_code,
                "ip_address": get_client_ip(request=request),
                "user_agent": request.META.get("HTTP_USER_AGENT", None),
            }
            user_id = (
                str(request.user.id)
                if getattr(request, "user") and getattr(request.user, "is_authenticated", False)
                else None
            )
            # Additional fields for MongoDB
            mongo_log = {
                **log_data,
                "created_at": timezone.now(),
                "updated_at": timezone.now(),
                "created_by": user_id,
                "updated_by": user_id,
            }

            process_logs.delay(log_data=log_data, mongo_log=mongo_log)

        except Exception as e:
            log_exception(e)

        return None
