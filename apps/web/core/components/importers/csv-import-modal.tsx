/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CSV work-item import modal — mote.
// See docs/mote-design/06-integrations-importers-automations.md.
// Paste CSV or upload a .csv file, POST to the importer endpoint, show the
// created / errored row summary.

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, EModalWidth, ModalCore } from "@plane/ui";
// services
import importerService, { type TCSVImportResult } from "@/services/importer.service";

type TProps = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  onImported?: () => void;
};

export const CSVImportModal = observer(function CSVImportModal(props: TProps) {
  const { isOpen, handleClose, workspaceSlug, projectId, onImported } = props;
  const [csv, setCsv] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TCSVImportResult | null>(null);

  const reset = () => {
    setCsv("");
    setResult(null);
    setIsSubmitting(false);
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const onSubmit = async () => {
    if (!csv.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await importerService.importIssuesCSV(workspaceSlug, projectId, csv);
      setResult(res ?? null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Import complete",
        message: `${res?.created_count ?? 0} work items created, ${res?.error_count ?? 0} rows skipped.`,
      });
      onImported?.();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Could not import the CSV." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const close = () => {
    reset();
    handleClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={close} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-medium text-primary">Import work items from CSV</h3>
          <p className="text-sm text-tertiary">
            Columns: <code>name</code> (required), <code>description</code>, <code>priority</code>,{" "}
            <code>state</code> (by name). First row is the header. <b>Jira</b> and <b>Notion</b> CSV
            exports work directly (Summary/Status/Priority are auto-mapped; Highest/Lowest priorities
            normalized).
          </p>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-subtle px-3 py-1.5 text-sm text-secondary hover:bg-layer-1">
          Choose .csv file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>

        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"name,description,priority,state\nDesign login,First task,high,Todo"}
          rows={8}
          className="w-full rounded-md border border-subtle bg-transparent p-2 font-mono text-xs text-primary outline-none focus:border-accent-primary"
        />

        {result ? (
          <div className="rounded-md border border-subtle p-3 text-sm">
            <p className="font-medium text-primary">
              {result.created_count} created · {result.error_count} skipped
            </p>
            {result.error_count > 0 ? (
              <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-tertiary">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {typeof e.error === "string" ? e.error : JSON.stringify(e.error)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={close}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void onSubmit()} loading={isSubmitting} disabled={!csv.trim() || isSubmitting}>
            {isSubmitting ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
