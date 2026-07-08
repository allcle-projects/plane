/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Project States — mote (Phase 2).
// See docs/mote-design/04-planning-hierarchy.md, section 3.
//
// Inline create/edit form for a workspace project state. Mirrors the issue-state
// editor form (core/components/project-states/create-update/form.tsx) but adds a
// group selector since project states carry one of the 6 lifecycle groups.

import { useEffect, useState } from "react";
import { TwitterPicker } from "react-color";
import { ChevronDown } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { CustomMenu, Popover, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// plane web types
import type { TProjectState, TProjectStateGroup } from "@/plane-web/types/workspace-project-states";
import { PROJECT_STATE_GROUPS } from "@/plane-web/types/workspace-project-states";

type TProjectStateForm = {
  data: Partial<TProjectState>;
  onSubmit: (formData: Partial<TProjectState>) => Promise<void>;
  onCancel: () => void;
  buttonDisabled: boolean;
  buttonTitle: string;
};

function PopoverButton({ color }: { color?: string }) {
  return (
    <div
      className="group inline-flex h-5 w-5 items-center rounded-sm text-14 font-medium transition-all focus:outline-none"
      style={{
        backgroundColor: color ?? "#60646C",
      }}
    />
  );
}

export function ProjectStateForm(props: TProjectStateForm) {
  const { data, onSubmit, onCancel, buttonDisabled, buttonTitle } = props;
  // states
  const [formData, setFormData] = useState<Partial<TProjectState> | undefined>(undefined);
  const [errors, setErrors] = useState<Partial<Record<keyof TProjectState, string>> | undefined>(undefined);

  useEffect(() => {
    if (data && !formData) setFormData(data);
  }, [data, formData]);

  const handleFormData = <T extends keyof TProjectState>(key: T, value: TProjectState[T]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const formSubmit = async (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();

    const name = formData?.name || undefined;
    if (!formData || !name) {
      let currentErrors: Partial<Record<keyof TProjectState, string>> = {};
      if (!name) currentErrors = { ...currentErrors, name: "Name is required" };
      setErrors(currentErrors);
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error("project state form error", error);
    }
  };

  return (
    <div className="relative flex space-x-2 rounded-sm bg-surface-1 p-3">
      {/* color */}
      <div className="mt-2 h-full flex-shrink-0">
        <Popover button={<PopoverButton color={formData?.color} />} panelClassName="mt-4 -ml-3">
          <TwitterPicker color={formData?.color} onChange={(value) => handleFormData("color", value.hex)} />
        </Popover>
      </div>

      <div className="w-full space-y-2">
        {/* title */}
        <Input
          id="name"
          type="text"
          name="name"
          placeholder="Name"
          value={formData?.name}
          onChange={(e) => handleFormData("name", e.target.value)}
          hasError={(errors && Boolean(errors.name)) || false}
          className="w-full"
          maxLength={100}
          autoFocus
        />

        {/* group */}
        <CustomMenu
          className="w-full"
          customButton={
            <div
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-13 capitalize"
              )}
            >
              <span>{formData?.group ?? "backlog"}</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            </div>
          }
          placement="bottom-start"
          closeOnSelect
        >
          {PROJECT_STATE_GROUPS.map((group: TProjectStateGroup) => (
            <CustomMenu.MenuItem key={group} className="capitalize" onClick={() => handleFormData("group", group)}>
              {group}
            </CustomMenu.MenuItem>
          ))}
        </CustomMenu>

        <div className="flex items-center space-x-2">
          <Button onClick={formSubmit} variant="primary" size="lg" disabled={buttonDisabled}>
            {buttonTitle}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={buttonDisabled} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
