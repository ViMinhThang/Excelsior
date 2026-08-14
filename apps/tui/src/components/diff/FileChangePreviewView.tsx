import { memo } from "react";
import {
  buildFileChangePreviewFrame,
  type FileChangePreview,
} from "@excelsior/client";
import type { ThemeTokens } from "../../theme/tokens.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface FileChangePreviewViewProps {
  preview: FileChangePreview;
  tokens: ThemeTokens;
  terminalColumns: number;
  pending?: boolean;
  hideRemovedRows?: boolean;
}

export const FileChangePreviewView = memo(function FileChangePreviewView({
  preview,
  tokens,
  terminalColumns,
  pending = false,
  hideRemovedRows = false,
}: FileChangePreviewViewProps) {
  const frame = buildFileChangePreviewFrame({
    preview,
    terminalColumns,
    pending,
    hideRemovedRows,
  });
  const width = Math.max(20, frame.previewWidth - 2);

  const actionLabel =
    preview.action === "create"
      ? "Added"
      : preview.action === "overwrite"
        ? "Overwrote"
        : "Modified";
  const actionColor =
    preview.action === "create"
      ? tokens.diffAddedText
      : tokens.highlight;

  return (
    <box flexDirection="column" width={width} marginY={0}>
      <text fg={tokens.diffContextText} wrapMode="char" width={width}>
        <span fg={actionColor} attributes={textAttrs({ bold: true })}>
          {`● ${actionLabel} `}
        </span>
        <span fg={tokens.text} attributes={textAttrs({ bold: true })}>
          {preview.filePath}
        </span>
        {" "}
        <span fg={tokens.diffAddedText} attributes={textAttrs({ bold: true })}>
          {`+${preview.added}`}
        </span>
        {" "}
        <span fg={tokens.diffRemovedText} attributes={textAttrs({ bold: true })}>
          {`-${preview.removed}`}
        </span>
      </text>
      <box flexDirection="column" width={width}>
        {frame.inlineRows.map((row, index) => {
          const fg =
            row.tone === "added"
              ? tokens.diffAddedText
              : row.tone === "removed"
                ? tokens.diffRemovedText
                : tokens.diffContextText;
          const marker = row.marker === " " ? "  " : `${row.marker} `;
          return (
            <text key={index} fg={fg} wrapMode="char" width={width} truncate>
              <span fg={tokens.assistantBorder}>{"│ "}</span>
              <span fg={fg}>{marker}</span>
              {row.text}
            </text>
          );
        })}
        {frame.isCapped ? (
          <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
            <span fg={tokens.assistantBorder}>{"│ "}</span>
            {`… ${frame.totalInlineRows - frame.inlineRows.length} more rows (ctrl+o to expand)`}
          </text>
        ) : null}
      </box>
    </box>
  );
});
