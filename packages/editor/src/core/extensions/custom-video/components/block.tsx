/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Download } from "lucide-react";
import { useCallback } from "react";
// plane imports
import { cn } from "@plane/utils";
// local imports
import type { CustomVideoNodeViewProps } from "./node-view";

type CustomVideoBlockProps = CustomVideoNodeViewProps & {
  videoFromFileSystem: string | undefined;
  setFailedToLoadVideo: (isError: boolean) => void;
  src: string | undefined;
  downloadSrc: string | undefined;
};

export function CustomVideoBlock(props: CustomVideoBlockProps) {
  const { selected, setFailedToLoadVideo, src: resolvedVideoSrc, downloadSrc, videoFromFileSystem } = props;

  const videoSrc = videoFromFileSystem || resolvedVideoSrc;

  const handleError = useCallback(() => {
    setFailedToLoadVideo(true);
  }, [setFailedToLoadVideo]);

  const handleDownload = useCallback(() => {
    if (!downloadSrc) return;
    window.open(downloadSrc, "_blank", "noopener,noreferrer");
  }, [downloadSrc]);

  return (
    <div
      className={cn("group/video-block relative my-1 max-w-full rounded-md", {
        "outline outline-2 outline-offset-2 outline-[var(--border-color-accent-strong)]": selected,
      })}
      contentEditable={false}
    >
      <video
        src={videoSrc}
        controls
        preload="metadata"
        className="max-h-[480px] max-w-full rounded-md bg-layer-3"
        onError={handleError}
      >
        Your browser does not support playing this video.
      </video>
      {downloadSrc && (
        <button
          type="button"
          onClick={handleDownload}
          title="Download video"
          className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-11 text-white opacity-0 transition-opacity duration-150 group-hover/video-block:opacity-100"
        >
          <Download className="size-3.5" />
        </button>
      )}
    </div>
  );
}
