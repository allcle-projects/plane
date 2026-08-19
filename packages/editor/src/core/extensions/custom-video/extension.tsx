/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import { v4 as uuidv4 } from "uuid";
// constants
import { ACCEPTED_VIDEO_MIME_TYPES } from "@/constants/config";
// helpers
import { isFileValid } from "@/helpers/file";
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
// types
import type { TFileHandler } from "@/types";
// local imports
import type { CustomVideoNodeViewProps } from "./components/node-view";
import { CustomVideoNodeView } from "./components/node-view";
import { CustomVideoExtensionConfig } from "./extension-config";
import type { CustomVideoExtensionOptions, CustomVideoExtensionStorage } from "./types";
import { ECustomVideoAttributeNames, ECustomVideoStatus } from "./types";
import { getVideoComponentFileMap } from "./utils";

type Props = {
  fileHandler: TFileHandler;
  isEditable: boolean;
};

export function CustomVideoExtension(props: Props) {
  const { fileHandler, isEditable } = props;
  // derived values
  const { getAssetSrc, getAssetDownloadSrc } = fileHandler;

  return CustomVideoExtensionConfig.extend<CustomVideoExtensionOptions, CustomVideoExtensionStorage>({
    selectable: isEditable,
    draggable: isEditable,

    addOptions() {
      const upload = "upload" in fileHandler ? fileHandler.upload : undefined;
      return {
        ...this.parent?.(),
        getVideoDownloadSource: getAssetDownloadSrc,
        getVideoSource: getAssetSrc,
        uploadVideo: upload,
      };
    },

    addStorage() {
      const maxFileSize = "validation" in fileHandler ? fileHandler.validation?.maxFileSize : 0;

      return {
        fileMap: new Map(),
        maxFileSize,
        // escape markdown for videos
        markdown: {
          serialize() {},
        },
      };
    },

    addCommands() {
      return {
        insertVideoComponent:
          (props) =>
          ({ commands }) => {
            // Early return if there's an invalid file being dropped
            if (
              props?.file &&
              !isFileValid({
                acceptedMimeTypes: ACCEPTED_VIDEO_MIME_TYPES,
                file: props.file,
                maxFileSize: this.storage.maxFileSize,
                onError: (_error, message) => alert(message),
              })
            ) {
              return false;
            }

            // generate a unique id for the video to keep track of dropped
            // files' file data
            const fileId = uuidv4();

            const videoComponentFileMap = getVideoComponentFileMap(this.editor);

            if (videoComponentFileMap) {
              if (props?.event === "drop" && props.file) {
                videoComponentFileMap.set(fileId, {
                  file: props.file,
                  event: props.event,
                });
              } else if (props.event === "insert") {
                videoComponentFileMap.set(fileId, {
                  event: props.event,
                  hasOpenedFileInputOnce: false,
                });
              }
            }

            const attributes = {
              [ECustomVideoAttributeNames.ID]: fileId,
              [ECustomVideoAttributeNames.STATUS]: ECustomVideoStatus.PENDING,
            };

            if (props.pos) {
              return commands.insertContentAt(props.pos, {
                type: this.name,
                attrs: attributes,
              });
            }
            return commands.insertContent({
              type: this.name,
              attrs: attributes,
            });
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
        ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => (
        <CustomVideoNodeView {...props} node={props.node as CustomVideoNodeViewProps["node"]} />
      ));
    },
  });
}
