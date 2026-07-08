/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Automations rule engine — mote.
// See docs/mote-design/06-integrations-importers-automations.md, Feature 3.
//
// Replaces the paid-Plane CE stub. Project-settings management surface for
// custom automation rules: header + "New rule" action, the rule list, and
// the create/edit rule modal. Mirrors the shape of
// ce/components/issues/recurring/root.tsx.

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Plus } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/ui";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// plane web imports
import { useAutomations } from "@/plane-web/hooks/store/use-automations";
// local imports
import { RuleList } from "./rule-list";
import { RuleModal } from "./rule-modal";

export type TCustomAutomationsRootProps = {
  projectId: string;
  workspaceSlug: string;
};

export const CustomAutomationsRoot = observer(function CustomAutomationsRoot(props: TCustomAutomationsRootProps) {
  const { projectId, workspaceSlug } = props;
  const { t } = useTranslation();
  // store hooks
  const { fetchAutomationRules } = useAutomations();
  const { allowPermissions } = useUserPermissions();
  // state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isEditable = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);

  useSWR(
    workspaceSlug && projectId ? `AUTOMATION_RULES_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchAutomationRules(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  const openCreate = () => {
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEdit = (ruleId: string) => {
    setEditingId(ruleId);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="flex flex-col">
          <h3 className="text-base font-medium text-primary">
            {t("project_settings.automations.custom.heading")}
          </h3>
          <span className="text-sm text-tertiary">{t("project_settings.automations.custom.description")}</span>
        </div>
        {isEditable && (
          <Button variant="primary" size="sm" prependIcon={<Plus className="size-3.5" />} onClick={openCreate}>
            {t("project_settings.automations.custom.new_rule")}
          </Button>
        )}
      </div>

      <RuleList workspaceSlug={workspaceSlug} projectId={projectId} isEditable={isEditable} onEdit={openEdit} />

      <RuleModal
        isOpen={isModalOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        ruleId={editingId}
        handleClose={handleClose}
      />
    </section>
  );
});
