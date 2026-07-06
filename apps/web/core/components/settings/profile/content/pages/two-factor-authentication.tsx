/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Copy, Download } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
// services
import { AuthService } from "@/services/auth.service";

const authService = new AuthService();

type TStep = "idle" | "enrolling" | "backup";

// Backend does not expose an MFA status endpoint or a user-level flag, so the UI
// cannot know on load whether the current user already has MFA enabled. Both the
// enrollment flow and the disable control are therefore always offered; the
// backend returns a clear error (MFA_ALREADY_ENABLED / MFA_NOT_ENROLLED) when an
// action does not apply, which is surfaced as a toast.
export const TwoFactorAuthentication = observer(function TwoFactorAuthentication() {
  // states
  const [step, setStep] = useState<TStep>("idle");
  const [secret, setSecret] = useState<string>("");
  const [provisioningUri, setProvisioningUri] = useState<string>("");
  const [confirmCode, setConfirmCode] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  const getCsrfToken = async (): Promise<string> => {
    const data = await authService.requestCSRFToken();
    const token = data?.csrf_token;
    if (!token) throw new Error("csrf token not found");
    return token;
  };

  const showError = (error: unknown, fallback: string) => {
    const err = error as { error_message?: string; error_code?: string };
    setToast({
      type: TOAST_TYPE.ERROR,
      title: "Error",
      message: err?.error_message || fallback,
    });
  };

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      const csrfToken = await getCsrfToken();
      const { secret: newSecret, provisioning_uri } = await authService.mfaEnroll(csrfToken);
      setSecret(newSecret);
      setProvisioningUri(provisioning_uri);
      setStep("enrolling");
    } catch (error) {
      showError(error, "Failed to start two-factor enrollment.");
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const csrfToken = await getCsrfToken();
      const { backup_codes } = await authService.mfaConfirm(csrfToken, { code: confirmCode.trim() });
      setBackupCodes(backup_codes ?? []);
      setStep("backup");
      setConfirmCode("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Two-factor authentication enabled",
        message: "Save your backup codes in a safe place.",
      });
    } catch (error) {
      showError(error, "Invalid code. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      const csrfToken = await getCsrfToken();
      await authService.mfaDisable(csrfToken, { code: disableCode.trim() });
      setDisableCode("");
      setStep("idle");
      setSecret("");
      setProvisioningUri("");
      setBackupCodes([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Two-factor authentication disabled",
        message: "Two-factor authentication has been turned off for your account.",
      });
    } catch (error) {
      showError(error, "Failed to disable two-factor authentication.");
    } finally {
      setIsDisabling(false);
    }
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard?.writeText(backupCodes.join("\n")).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Copied",
        message: "Backup codes copied to clipboard.",
      })
    );
  };

  const handleDownloadBackupCodes = () => {
    const blob = new Blob([`${backupCodes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plane-backup-codes.txt";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-10 border-t border-subtle pt-8">
      <ProfileSettingsHeading
        title="Two-factor authentication"
        description="Add an extra layer of security to your account using a time-based one-time password (TOTP) app."
      />

      <div className="mt-7 flex flex-col gap-8">
        {/* Enrollment */}
        {step === "idle" && (
          <div>
            <Button variant="primary" size="lg" onClick={handleEnroll} loading={isEnrolling} disabled={isEnrolling}>
              {isEnrolling ? "Starting..." : "Set up two-factor authentication"}
            </Button>
          </div>
        )}

        {step === "enrolling" && (
          <div className="flex max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h4 className="text-13 font-medium">1. Add this account to your authenticator app</h4>
              <p className="text-11 text-tertiary">
                Scan the provisioning URI with your authenticator app, or enter the setup key manually.
              </p>
              {/* NOTE: No QR-code renderer is bundled in this repo. Until one is added, the
                  provisioning URI and setup key are shown as text for manual entry. */}
              <div className="flex flex-col gap-1">
                <span className="text-11 font-medium text-tertiary">Setup key</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-md border border-strong bg-surface-1 p-2 text-13">
                    {secret}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    prependIcon={<Copy className="size-3.5" />}
                    onClick={() => {
                      navigator.clipboard?.writeText(secret);
                      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Setup key copied." });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-11 font-medium text-tertiary">Provisioning URI (otpauth://)</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-md border border-strong bg-surface-1 p-2 text-11">
                    {provisioningUri}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    prependIcon={<Copy className="size-3.5" />}
                    onClick={() => {
                      navigator.clipboard?.writeText(provisioningUri);
                      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Provisioning URI copied." });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-13 font-medium">2. Enter the 6-digit code from your app to confirm</h4>
              <div className="flex items-center gap-2">
                <Input
                  id="mfa_confirm_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  placeholder="123456"
                  className="w-40"
                />
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConfirm}
                  loading={isConfirming}
                  disabled={isConfirming || confirmCode.trim().length === 0}
                >
                  {isConfirming ? "Confirming..." : "Confirm & enable"}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    setStep("idle");
                    setSecret("");
                    setProvisioningUri("");
                    setConfirmCode("");
                  }}
                  disabled={isConfirming}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "backup" && (
          <div className="flex max-w-xl flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h4 className="text-13 font-medium">Save your backup codes</h4>
              <p className="text-11 text-tertiary">
                Each code can be used once if you lose access to your authenticator app. Store them somewhere safe.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-strong bg-surface-1 p-4">
              {backupCodes.map((backupCode) => (
                <code key={backupCode} className="text-13">
                  {backupCode}
                </code>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<Download className="size-4" />}
                onClick={handleDownloadBackupCodes}
              >
                Download
              </Button>
              <Button
                variant="secondary"
                size="lg"
                prependIcon={<Copy className="size-4" />}
                onClick={handleCopyBackupCodes}
              >
                Copy
              </Button>
              <Button variant="primary" size="lg" onClick={() => setStep("idle")}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Disable */}
        {step === "idle" && (
          <div className="flex flex-col gap-2">
            <h4 className="text-13 font-medium">Disable two-factor authentication</h4>
            <p className="text-11 text-tertiary">
              Enter a current authentication code or a backup code to turn off two-factor authentication.
            </p>
            <div className="flex items-center gap-2">
              <Input
                id="mfa_disable_code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="123456 or backup code"
                className="w-56"
              />
              <Button
                variant="error-fill"
                size="lg"
                onClick={handleDisable}
                loading={isDisabling}
                disabled={isDisabling || disableCode.trim().length === 0}
              >
                {isDisabling ? "Disabling..." : "Disable"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
