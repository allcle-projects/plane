/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Node } from "@tiptap/core";
// types
import type { TFileHandler } from "@/types";

export enum ECustomVideoAttributeNames {
  ID = "id",
  SOURCE = "src",
  STATUS = "status",
}

export enum ECustomVideoStatus {
  PENDING = "pending",
  UPLOADING = "uploading",
  UPLOADED = "uploaded",
}

export type TCustomVideoAttributes = {
  [ECustomVideoAttributeNames.ID]: string | null;
  [ECustomVideoAttributeNames.SOURCE]: string | null;
  [ECustomVideoAttributeNames.STATUS]: ECustomVideoStatus;
};

export type UploadEntity = ({ event: "insert" } | { event: "drop"; file: File }) & { hasOpenedFileInputOnce?: boolean };

export type InsertVideoComponentProps = {
  file?: File;
  pos?: number;
  event: "insert" | "drop";
};

export type CustomVideoExtensionOptions = {
  getVideoSource: TFileHandler["getAssetSrc"];
  getVideoDownloadSource: TFileHandler["getAssetDownloadSrc"];
  uploadVideo?: TFileHandler["upload"];
};

export type CustomVideoExtensionStorage = {
  fileMap: Map<string, UploadEntity>;
  maxFileSize: number;
};

export type CustomVideoExtensionType = Node<CustomVideoExtensionOptions, CustomVideoExtensionStorage>;
