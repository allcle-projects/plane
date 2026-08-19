/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { VideoIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
// plane imports
import { cn } from "@plane/utils";
// constants
import { ACCEPTED_VIDEO_MIME_TYPES } from "@/constants/config";
// helpers
import type { EFileError } from "@/helpers/file";
// hooks
import { useUploader, useDropZone, uploadFirstFileAndInsertRemaining } from "@/hooks/use-file-upload";
// local imports
import { ECustomVideoStatus } from "../types";
import { getVideoComponentFileMap } from "../utils";
import type { CustomVideoNodeViewProps } from "./node-view";

type CustomVideoUploaderProps = CustomVideoNodeViewProps & {
  failedToLoadVideo: boolean;
  loadVideoFromFileSystem: (file: string) => void;
  maxFileSize: number;
  setIsUploaded: (isUploaded: boolean) => void;
};

export function CustomVideoUploader(props: CustomVideoUploaderProps) {
  const {
    editor,
    extension,
    failedToLoadVideo,
    getPos,
    loadVideoFromFileSystem,
    maxFileSize,
    node,
    selected,
    setIsUploaded,
    updateAttributes,
  } = props;
  // refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasTriggeredFilePickerRef = useRef(false);
  const hasTriedUploadingOnMountRef = useRef(false);
  const { id: videoEntityId } = node.attrs;
  // derived values
  const videoComponentFileMap = useMemo(() => getVideoComponentFileMap(editor), [editor]);
  const isTouchDevice = !!(editor.storage.utility as { isTouchDevice?: boolean } | undefined)?.isTouchDevice;

  const onUpload = useCallback(
    (url: string) => {
      if (url) {
        if (!videoEntityId) return;
        setIsUploaded(true);
        updateAttributes({
          src: url,
          status: ECustomVideoStatus.UPLOADED,
        });
        videoComponentFileMap?.delete(videoEntityId);
      }
    },
    [videoComponentFileMap, videoEntityId, updateAttributes, setIsUploaded]
  );

  const uploadVideoEditorCommand = useCallback(
    async (file: File) => {
      updateAttributes({ status: ECustomVideoStatus.UPLOADING });
      return await extension.options.uploadVideo?.(videoEntityId ?? "", file);
    },
    [extension.options, videoEntityId, updateAttributes]
  );

  const handleProgressStatus = useCallback(
    (isUploading: boolean) => {
      editor.storage.utility.uploadInProgress = isUploading;
    },
    [editor]
  );

  const handleInvalidFile = useCallback((_error: EFileError, _file: File, message: string) => {
    alert(message);
  }, []);

  // hooks
  const { isUploading: isVideoBeingUploaded, uploadFile } = useUploader({
    acceptedMimeTypes: ACCEPTED_VIDEO_MIME_TYPES,
    editorCommand: uploadVideoEditorCommand,
    handleProgressStatus,
    loadFileFromFileSystem: loadVideoFromFileSystem,
    maxFileSize,
    onInvalidFile: handleInvalidFile,
    onUpload,
  });

  const { draggedInside, onDrop, onDragEnter, onDragLeave } = useDropZone({
    editor,
    getPos,
    type: "attachment",
    uploader: uploadFile,
  });

  // after the video component is mounted we start the upload process based on
  // it's uploaded
  useEffect(() => {
    if (hasTriedUploadingOnMountRef.current) return;

    const meta = videoComponentFileMap?.get(videoEntityId ?? "");
    if (meta) {
      if (meta.event === "drop" && "file" in meta) {
        hasTriedUploadingOnMountRef.current = true;
        uploadFile(meta.file);
      } else if (meta.event === "insert" && fileInputRef.current && !hasTriggeredFilePickerRef.current) {
        if (meta.hasOpenedFileInputOnce) return;
        if (!isTouchDevice) {
          fileInputRef.current.click();
        }
        hasTriggeredFilePickerRef.current = true;
        videoComponentFileMap?.set(videoEntityId ?? "", { ...meta, hasOpenedFileInputOnce: true });
      }
    } else {
      hasTriedUploadingOnMountRef.current = true;
    }
  }, [videoEntityId, isTouchDevice, uploadFile, videoComponentFileMap]);

  const onFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      const filesList = e.target.files;
      const pos = getPos();
      if (!filesList || pos === undefined) {
        return;
      }
      await uploadFirstFileAndInsertRemaining({
        editor,
        filesList,
        pos,
        type: "attachment",
        uploader: uploadFile,
      });
    },
    [uploadFile, editor, getPos]
  );

  const getDisplayMessage = useCallback(() => {
    if (failedToLoadVideo) {
      return "Error loading video";
    }
    if (isVideoBeingUploaded) {
      return "Uploading...";
    }
    if (draggedInside && editor.isEditable) {
      return "Drop video here";
    }
    return "Add a video";
  }, [draggedInside, editor.isEditable, failedToLoadVideo, isVideoBeingUploaded]);

  return (
    <div
      className={cn(
        "video-upload-component flex cursor-default items-center justify-start gap-2 rounded-lg border border-dashed bg-layer-3 px-2 py-3 text-tertiary transition-all duration-200 ease-in-out",
        {
          "border-subtle": !(selected && editor.isEditable && !failedToLoadVideo),
          "cursor-pointer hover:bg-layer-3-hover hover:text-secondary": editor.isEditable && !failedToLoadVideo,
          "bg-layer-3-hover text-secondary": draggedInside && editor.isEditable && !failedToLoadVideo,
          "bg-accent-primary/10 text-accent-secondary hover:bg-accent-primary/10 hover:text-accent-secondary":
            selected && editor.isEditable && !failedToLoadVideo,
          "cursor-default bg-danger-subtle text-danger-primary": failedToLoadVideo,
        }
      )}
      onDrop={onDrop}
      onDragOver={onDragEnter}
      onDragLeave={onDragLeave}
      contentEditable={false}
      onClick={() => {
        if (!failedToLoadVideo && editor.isEditable) {
          fileInputRef.current?.click();
        }
      }}
    >
      <VideoIcon className="size-4" />
      <div className="flex-1 text-14 font-medium">{getDisplayMessage()}</div>
      <input
        className="size-0 overflow-hidden"
        ref={fileInputRef}
        hidden
        type="file"
        accept={ACCEPTED_VIDEO_MIME_TYPES.join(",")}
        onChange={onFileChange}
        multiple
      />
    </div>
  );
}
