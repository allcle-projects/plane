/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import { Button } from "@plane/propel/button";
import { Input } from "@plane/ui";
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import { EAuthenticationErrorCodes, EErrorAlertType, authErrorHandler } from "@/helpers/authentication.helper";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { AuthService } from "@/services/auth.service";
// local imports
import { AuthBanner } from "./auth-banner";
import { FormContainer } from "./common/container";
import { AuthFormHeader } from "./common/header";

// services
const authService = new AuthService();

export const MFAChallengeForm = observer(function MFAChallengeForm() {
  // router
  const router = useAppRouter();
  // search params
  const searchParams = useSearchParams();
  const error_code = searchParams.get("error_code");
  // states
  const [code, setCode] = useState("");
  const [csrfToken, setCsrfToken] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [errorInfo, setErrorInfo] = useState<TAuthErrorInfo | undefined>(undefined);

  useEffect(() => {
    if (csrfToken === undefined)
      authService.requestCSRFToken().then((data) => data?.csrf_token && setCsrfToken(data.csrf_token));
  }, [csrfToken]);

  useEffect(() => {
    if (error_code) {
      const errorhandler = authErrorHandler(error_code?.toString() as EAuthenticationErrorCodes);
      if (errorhandler) setErrorInfo(errorhandler);
    }
  }, [error_code]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!csrfToken) return;
    setIsSubmitting(true);
    setErrorInfo(undefined);
    try {
      const { redirect_path } = await authService.mfaVerify(csrfToken, { code: code.trim() });
      router.push(`/${redirect_path ?? ""}`);
    } catch (error: unknown) {
      const err = error as { error_code?: string; error_message?: string };
      const errorhandler = err.error_code
        ? authErrorHandler(err.error_code.toString() as EAuthenticationErrorCodes)
        : undefined;
      setErrorInfo(
        errorhandler ?? {
          type: EErrorAlertType.BANNER_ALERT,
          code: EAuthenticationErrorCodes.MFA_INVALID_CODE,
          title: "Invalid code",
          message: "Invalid authentication code. Please try again.",
        }
      );
      setIsSubmitting(false);
    }
  };

  const isButtonDisabled = code.trim().length === 0 || isSubmitting || !csrfToken;

  return (
    <FormContainer>
      <AuthFormHeader
        title="Two-factor authentication"
        description={
          useBackupCode
            ? "Enter one of your backup codes."
            : "Enter the 6-digit code from your authenticator app."
        }
      />

      {errorInfo && errorInfo?.type === EErrorAlertType.BANNER_ALERT && (
        <AuthBanner message={errorInfo.message} handleBannerData={(value) => setErrorInfo(value)} />
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="text-13 font-medium text-tertiary" htmlFor="code">
            {useBackupCode ? "Backup code" : "Authentication code"}
          </label>
          <div className="relative flex items-center rounded-md bg-surface-1">
            <Input
              id="code"
              name="code"
              type="text"
              inputMode={useBackupCode ? "text" : "numeric"}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={useBackupCode ? "xxxxx-xxxxx" : "123456"}
              className="h-10 w-full border border-strong !bg-surface-1 placeholder:text-placeholder"
              autoFocus
            />
          </div>
        </div>
        <Button type="submit" variant="primary" className="w-full" size="xl" loading={isSubmitting} disabled={isButtonDisabled}>
          {isSubmitting ? "Verifying..." : "Verify"}
        </Button>
      </form>

      <button
        type="button"
        className="text-13 font-medium text-tertiary underline underline-offset-4 transition-all hover:text-primary"
        onClick={() => {
          setUseBackupCode((prev) => !prev);
          setCode("");
          setErrorInfo(undefined);
        }}
      >
        {useBackupCode ? "Use authenticator app instead" : "Use a backup code instead"}
      </button>
    </FormContainer>
  );
});
