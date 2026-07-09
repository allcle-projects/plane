/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import useSWR from "swr";
import { Trash2 } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IntegrationMappingService } from "@/services/integration-mapping.service";
// local imports
import { IntegrationsProjectSettingsHeader } from "./header";

const integrationMappingService = new IntegrationMappingService();

function IntegrationsSettingsPage() {
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentProjectDetails: projectDetails } = useProject();
  // local state
  const [slackForm, setSlackForm] = useState({ webhook_url: "", channel: "", team_id: "" });
  const [githubForm, setGithubForm] = useState({ owner: "", name: "", url: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // derived values
  const canPerformProjectAdminActions = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);
  const pageTitle = projectDetails?.name ? `${projectDetails?.name} - Integrations` : undefined;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const intakeUrl = `${origin}/api/slack/intake/${workspaceSlug ?? ""}/${projectId ?? ""}/`;

  const slackKey = workspaceSlug && projectId ? `SLACK_SYNCS_${workspaceSlug}_${projectId}` : null;
  const githubKey = workspaceSlug && projectId ? `GITHUB_SYNCS_${workspaceSlug}_${projectId}` : null;

  const { data: slackSyncs, mutate: mutateSlack } = useSWR(
    canPerformProjectAdminActions ? slackKey : null,
    canPerformProjectAdminActions ? () => integrationMappingService.listSlackSyncs(workspaceSlug!, projectId!) : null
  );
  const { data: githubSyncs, mutate: mutateGithub } = useSWR(
    canPerformProjectAdminActions ? githubKey : null,
    canPerformProjectAdminActions ? () => integrationMappingService.listGithubSyncs(workspaceSlug!, projectId!) : null
  );

  const onError = () =>
    setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Something went wrong. Please try again." });

  const handleAddSlack = async () => {
    if (!workspaceSlug || !projectId || !slackForm.webhook_url) return;
    setIsSubmitting(true);
    try {
      await integrationMappingService.createSlackSync(workspaceSlug, projectId, slackForm);
      setSlackForm({ webhook_url: "", channel: "", team_id: "" });
      await mutateSlack();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Added", message: "Slack channel map created." });
    } catch {
      onError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSlack = async (id: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      await integrationMappingService.deleteSlackSync(workspaceSlug, projectId, id);
      await mutateSlack();
    } catch {
      onError();
    }
  };

  const handleAddGithub = async () => {
    if (!workspaceSlug || !projectId || !githubForm.owner || !githubForm.name) return;
    setIsSubmitting(true);
    try {
      await integrationMappingService.createGithubSync(workspaceSlug, projectId, githubForm);
      setGithubForm({ owner: "", name: "", url: "" });
      await mutateGithub();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Added", message: "GitHub repository map created." });
    } catch {
      onError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGithub = async (id: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      await integrationMappingService.deleteGithubSync(workspaceSlug, projectId, id);
      await mutateGithub();
    } catch {
      onError();
    }
  };

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IntegrationsProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title="Integrations"
          description="Map this project to a Slack channel and GitHub repository. The task-bot bridge uses these maps to route notifications and issue references (Option B — no OAuth)."
        />

        {/* Slack channel maps */}
        <div className="mt-6">
          <h4 className="text-base font-medium text-custom-text-100">Slack channel</h4>
          <p className="mt-1 text-sm text-custom-text-300">
            Paste a Slack incoming-webhook URL. Notifications for this project post to its channel.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(slackSyncs ?? []).map((sync) => (
              <div
                key={sync.id}
                className="flex items-center justify-between gap-3 rounded border border-custom-border-200 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-custom-text-100">{sync.channel || "(channel from webhook)"}</span>
                  <span className="ml-2 truncate text-custom-text-300">{sync.webhook_url}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSlack(sync.id)}
                  className="shrink-0 text-custom-text-300 hover:text-red-500"
                  aria-label="Remove Slack map"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={slackForm.webhook_url}
              onChange={(e) => setSlackForm((f) => ({ ...f, webhook_url: e.target.value }))}
              className="min-w-[280px] flex-1"
            />
            <Input
              type="text"
              placeholder="#channel (optional)"
              value={slackForm.channel}
              onChange={(e) => setSlackForm((f) => ({ ...f, channel: e.target.value }))}
              className="w-40"
            />
            <Input
              type="text"
              placeholder="team id (optional)"
              value={slackForm.team_id}
              onChange={(e) => setSlackForm((f) => ({ ...f, team_id: e.target.value }))}
              className="w-36"
            />
            <Button variant="primary" onClick={handleAddSlack} loading={isSubmitting} disabled={!slackForm.webhook_url}>
              Add
            </Button>
          </div>
        </div>

        {/* GitHub repository maps */}
        <div className="mt-10">
          <h4 className="text-base font-medium text-custom-text-100">GitHub repository</h4>
          <p className="mt-1 text-sm text-custom-text-300">
            Map this project to a repository (owner/name). The task-bot bridge links PR/issue references back to this
            project.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(githubSyncs ?? []).map((sync) => (
              <div
                key={sync.id}
                className="flex items-center justify-between gap-3 rounded border border-custom-border-200 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-custom-text-100">
                    {sync.owner}/{sync.name}
                  </span>
                  {sync.url && <span className="ml-2 truncate text-custom-text-300">{sync.url}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteGithub(sync.id)}
                  className="shrink-0 text-custom-text-300 hover:text-red-500"
                  aria-label="Remove GitHub map"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="text"
              placeholder="owner"
              value={githubForm.owner}
              onChange={(e) => setGithubForm((f) => ({ ...f, owner: e.target.value }))}
              className="w-40"
            />
            <Input
              type="text"
              placeholder="repository name"
              value={githubForm.name}
              onChange={(e) => setGithubForm((f) => ({ ...f, name: e.target.value }))}
              className="w-48"
            />
            <Input
              type="url"
              placeholder="https://github.com/owner/repo (optional)"
              value={githubForm.url}
              onChange={(e) => setGithubForm((f) => ({ ...f, url: e.target.value }))}
              className="min-w-[240px] flex-1"
            />
            <Button
              variant="primary"
              onClick={handleAddGithub}
              loading={isSubmitting}
              disabled={!githubForm.owner || !githubForm.name}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Inbound: Slack suggestion → Plane work item */}
        <div className="mt-10">
          <h4 className="text-base font-medium text-custom-text-100">Slack → work item (inbound)</h4>
          <p className="mt-1 text-sm text-custom-text-300">
            Turn a Slack suggestion into a work item in this project. Point a Slack slash command (e.g.{" "}
            <code className="rounded bg-custom-background-80 px-1">/plane-task</code>) or a Slack Workflow-Builder webhook
            step at the URL below. New items land in this project.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="text"
              readOnly
              value={intakeUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="min-w-[320px] flex-1 font-mono text-xs"
            />
            <Button
              variant="neutral-primary"
              onClick={() => {
                navigator.clipboard?.writeText(intakeUrl);
                setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Intake URL copied." });
              }}
            >
              Copy URL
            </Button>
          </div>
          <p className="mt-2 text-xs text-custom-text-400">
            Requests are verified by the server-side Slack signing secret (<code>SLACK_SIGNING_SECRET</code>) or a shared
            token (<code>SLACK_INTAKE_TOKEN</code>). Ask your instance admin for the token if you use the Workflow-Builder
            path.
          </p>
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(IntegrationsSettingsPage);
