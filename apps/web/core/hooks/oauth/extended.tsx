/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { useSearchParams } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { API_BASE_URL } from "@plane/constants";
import type { TOAuthConfigs, TOAuthOption } from "@plane/types";
// hooks
import { useInstance } from "@/hooks/store/use-instance";

export const useExtendedOAuthConfig = (oauthActionText: string): TOAuthConfigs => {
  // router
  const searchParams = useSearchParams();
  // query params
  const next_path = searchParams.get("next_path");
  // store hooks
  const { config } = useInstance();
  // derived values
  const isOAuthEnabled = (config && config?.is_oidc_enabled) || false;
  const oAuthOptions: TOAuthOption[] = [
    {
      id: "oidc",
      text: `${oauthActionText} with SSO`,
      icon: <LockKeyhole size={18} className="text-tertiary" />,
      onClick: () => {
        window.location.assign(`${API_BASE_URL}/auth/oidc/${next_path ? `?next_path=${next_path}` : ``}`);
      },
      enabled: config?.is_oidc_enabled,
    },
  ];

  return {
    isOAuthEnabled,
    oAuthOptions,
  };
};
