# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models

# Module imports
from plane.license.utils.encryption import decrypt_data, encrypt_data

from .base import BaseModel


class UserMFA(BaseModel):
    """Per-user TOTP two-factor authentication state.

    The TOTP ``secret`` is stored encrypted at rest using the same Fernet
    helper (``encrypt_data``/``decrypt_data``) that ``InstanceConfiguration``
    uses for ``is_encrypted`` values. Never read ``secret`` directly; use
    ``set_secret``/``get_secret``.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa",
    )
    is_enabled = models.BooleanField(default=False)
    # Encrypted TOTP secret (Fernet). Set via set_secret(), read via get_secret().
    secret = models.CharField(max_length=255)
    confirmed_at = models.DateTimeField(null=True)
    # Last TOTP timestep (unix_time // 30) accepted for this user. Any code whose
    # timestep is <= this value is a replay and must be rejected, so a captured
    # code cannot be reused inside its skew window. Null until the first accept.
    last_verified_timestep = models.BigIntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "User MFA"
        verbose_name_plural = "User MFAs"
        db_table = "user_mfa"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user_id} <{self.is_enabled}>"

    def set_secret(self, raw_secret):
        """Encrypt and store the raw base32 TOTP secret."""
        self.secret = encrypt_data(raw_secret)

    def get_secret(self):
        """Return the decrypted raw base32 TOTP secret."""
        return decrypt_data(self.secret)


class MFABackupCode(BaseModel):
    """Single-use backup code for MFA recovery, hashed at rest."""

    mfa = models.ForeignKey(
        "db.UserMFA",
        on_delete=models.CASCADE,
        related_name="backup_codes",
    )
    # Hashed backup code (Django password hasher). Never stored in plaintext.
    code_hash = models.CharField(max_length=255)
    used_at = models.DateTimeField(null=True)

    class Meta:
        verbose_name = "MFA Backup Code"
        verbose_name_plural = "MFA Backup Codes"
        db_table = "mfa_backup_codes"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.mfa_id} <{self.used_at}>"

    def set_code(self, raw_code):
        """Hash and store a raw backup code."""
        self.code_hash = make_password(raw_code)

    def check_code(self, raw_code):
        """Return True if the raw code matches the stored hash."""
        return check_password(raw_code, self.code_hash)
