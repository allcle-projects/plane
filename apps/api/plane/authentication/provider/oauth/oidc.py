# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
from datetime import datetime
from urllib.parse import urlencode

import pytz

# Module imports
from plane.authentication.adapter.oauth import OauthAdapter
from plane.license.utils.instance_value import get_configuration_value
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)


class OIDCOAuthProvider(OauthAdapter):
    provider = "oidc"
    scope = "openid email profile"

    def __init__(self, request, code=None, state=None, callback=None):
        (
            OIDC_URL_AUTHORIZATION,
            OIDC_URL_TOKEN,
            OIDC_URL_USERINFO,
            OIDC_CLIENT_ID,
            OIDC_CLIENT_SECRET,
        ) = get_configuration_value(
            [
                {
                    "key": "OIDC_URL_AUTHORIZATION",
                    "default": os.environ.get("OIDC_URL_AUTHORIZATION"),
                },
                {
                    "key": "OIDC_URL_TOKEN",
                    "default": os.environ.get("OIDC_URL_TOKEN"),
                },
                {
                    "key": "OIDC_URL_USERINFO",
                    "default": os.environ.get("OIDC_URL_USERINFO"),
                },
                {
                    "key": "OIDC_CLIENT_ID",
                    "default": os.environ.get("OIDC_CLIENT_ID"),
                },
                {
                    "key": "OIDC_CLIENT_SECRET",
                    "default": os.environ.get("OIDC_CLIENT_SECRET"),
                },
            ]
        )

        if not (
            OIDC_URL_AUTHORIZATION
            and OIDC_URL_TOKEN
            and OIDC_URL_USERINFO
            and OIDC_CLIENT_ID
            and OIDC_CLIENT_SECRET
        ):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["OIDC_NOT_CONFIGURED"],
                error_message="OIDC_NOT_CONFIGURED",
            )

        self.authorization_url = OIDC_URL_AUTHORIZATION
        self.token_url = OIDC_URL_TOKEN
        self.userinfo_url = OIDC_URL_USERINFO

        client_id = OIDC_CLIENT_ID
        client_secret = OIDC_CLIENT_SECRET

        redirect_uri = f"""{"https" if request.is_secure() else "http"}://{request.get_host()}/auth/oidc/callback/"""
        url_params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": self.scope,
            "state": state,
        }
        auth_url = f"{self.authorization_url}?{urlencode(url_params)}"
        super().__init__(
            request,
            self.provider,
            client_id,
            self.scope,
            redirect_uri,
            auth_url,
            self.token_url,
            self.userinfo_url,
            client_secret,
            code,
            callback=callback,
        )

    def set_token_data(self):
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": self.code,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        token_response = self.get_user_token(data=data, headers={"Accept": "application/json"})
        super().set_token_data(
            {
                "access_token": token_response.get("access_token"),
                "refresh_token": token_response.get("refresh_token", None),
                "access_token_expired_at": (
                    datetime.fromtimestamp(
                        token_response.get("created_at") + token_response.get("expires_in"),
                        tz=pytz.utc,
                    )
                    if token_response.get("created_at") and token_response.get("expires_in")
                    else None
                ),
                "refresh_token_expired_at": (
                    datetime.fromtimestamp(token_response.get("refresh_token_expired_at"), tz=pytz.utc)
                    if token_response.get("refresh_token_expired_at")
                    else None
                ),
                "id_token": token_response.get("id_token", ""),
            }
        )

    def set_user_data(self):
        user_info_response = self.get_user_response()
        email = user_info_response.get("email")
        name = user_info_response.get("name")
        first_name = user_info_response.get("given_name") or name
        last_name = user_info_response.get("family_name") or ""
        super().set_user_data(
            {
                "email": email,
                "user": {
                    "provider_id": user_info_response.get("sub"),
                    "email": email,
                    "avatar": user_info_response.get("picture", ""),
                    "first_name": first_name,
                    "last_name": last_name,
                    "is_password_autoset": True,
                },
            }
        )
