# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import importlib

import pytest
from django.conf import settings


@pytest.mark.unit
class TestCeleryImports:
    """
    A task the api enqueues but the worker never imports is not an error anywhere
    — the worker just logs "Received unregistered task" and discards the message.
    That failure mode is silent by construction, so it gets asserted here.
    """

    def test_every_listed_module_is_importable(self):
        for module in settings.CELERY_IMPORTS:
            importlib.import_module(module)

    def test_logger_task_is_registered(self):
        """
        `APITokenLogMiddleware` enqueues `logger_task.process_logs` on every
        API-key request. Dropping it from CELERY_IMPORTS discards the whole
        audit trail without raising anything.
        """
        assert "plane.bgtasks.logger_task" in settings.CELERY_IMPORTS

    def test_no_duplicate_entries(self):
        imports = list(settings.CELERY_IMPORTS)
        assert len(imports) == len(set(imports))
