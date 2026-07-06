/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { ICsrfTokenData, IEmailCheckData, IEmailCheckResponse } from "@plane/types";
// helpers
// services
import { APIService } from "@/services/api.service";

// MFA (Two-Factor Authentication) response shapes. Mirrors
// plane.authentication.views.app.mfa on the backend.
export type TMFAEnrollResponse = {
  secret: string;
  provisioning_uri: string;
};

export type TMFAConfirmResponse = {
  backup_codes: string[];
};

export type TMFAVerifyResponse = {
  redirect_path: string;
};

export type TMFADisableResponse = {
  disabled: boolean;
};

export class AuthService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async requestCSRFToken(): Promise<ICsrfTokenData> {
    return this.get("/auth/get-csrf-token/")
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  emailCheck = async (data: IEmailCheckData): Promise<IEmailCheckResponse> =>
    this.post("/auth/email-check/", data, { headers: {} })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });

  async sendResetPasswordLink(data: { email: string }): Promise<any> {
    return this.post(`/auth/forgot-password/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async setPassword(token: string, data: { password: string }): Promise<any> {
    return this.post(`/auth/set-password/`, data, {
      headers: {
        "X-CSRFTOKEN": token,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async generateUniqueCode(data: { email: string }): Promise<any> {
    return this.post("/auth/magic-generate/", data, { headers: {} })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * MFA — start enrollment. Issues a fresh TOTP secret + provisioning URI.
   * Does NOT enable MFA; the user must confirm a code via mfaConfirm.
   * POST /auth/mfa/enroll/
   */
  async mfaEnroll(csrfToken: string): Promise<TMFAEnrollResponse> {
    return this.post(
      "/auth/mfa/enroll/",
      {},
      {
        headers: {
          "X-CSRFTOKEN": csrfToken,
        },
      }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * MFA — confirm the first code, enable MFA, and receive one-time backup codes.
   * POST /auth/mfa/confirm/
   */
  async mfaConfirm(csrfToken: string, data: { code: string }): Promise<TMFAConfirmResponse> {
    return this.post("/auth/mfa/confirm/", data, {
      headers: {
        "X-CSRFTOKEN": csrfToken,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * MFA — second factor during login. Verifies a TOTP or backup code against the
   * half-authenticated session marker and, on success, mints the full session.
   * POST /auth/mfa/verify/
   */
  async mfaVerify(csrfToken: string, data: { code: string }): Promise<TMFAVerifyResponse> {
    return this.post("/auth/mfa/verify/", data, {
      headers: {
        "X-CSRFTOKEN": csrfToken,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * MFA — disable for the current user. Requires a valid current TOTP or backup code.
   * POST /auth/mfa/disable/
   */
  async mfaDisable(csrfToken: string, data: { code: string }): Promise<TMFADisableResponse> {
    return this.post("/auth/mfa/disable/", data, {
      headers: {
        "X-CSRFTOKEN": csrfToken,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async signOut(baseUrl: string): Promise<any> {
    await this.requestCSRFToken().then((data) => {
      const csrfToken = data?.csrf_token;

      if (!csrfToken) throw Error("CSRF token not found");

      const form = document.createElement("form");
      const element1 = document.createElement("input");

      form.method = "POST";
      form.action = `${baseUrl}/auth/sign-out/`;

      element1.value = csrfToken;
      element1.name = "csrfmiddlewaretoken";
      element1.type = "hidden";
      form.appendChild(element1);

      document.body.appendChild(form);

      form.submit();
    });
  }
}
