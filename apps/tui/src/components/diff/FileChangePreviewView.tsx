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

  return (
    <box flexDirection="column" width={width} backgroundColor={tokens.diffHeaderBackground}>
      <text fg={tokens.diffContextText} attributes={textAttrs({ bold: true })} truncate width={width}>
        {preview.action === "create" ? "NEW" : preview.action === "overwrite" ? "OVERWRITE" : "EDIT"} {preview.filePath}
        {" "}
        <text fg={tokens.diffAddedText}>+{preview.added}</text>
        <text fg={tokens.diffRemovedText}> -{preview.removed}</text>
      </text>
      {frame.inlineRows.map((row, index) => {
        const fg =
          row.tone === "added"
            ? tokens.diffAddedText
            : row.tone === "removed"
              ? tokens.diffRemovedText
              : tokens.diffContextText;
        const bg =
          row.tone === "added"
            ? tokens.diffAddedBackground
            : row.tone === "removed"
              ? tokens.diffRemovedBackground
              : undefined;
        const marker = row.marker === " " ? " " : row.marker;
        return (
          <text key={index} fg={fg} bg={bg} wrapMode="char" width={width} truncate>
            {`${marker}${row.text}`}
          </text>
        );
      })}
      {frame.isCapped ? (
        <text fg={tokens.muted} attributes={textAttrs({ dim: true })}>
          {`… ${frame.totalInlineRows - frame.inlineRows.length} more rows (ctrl+o to expand)`}
        </text>
      ) : null}
    </box>
  );
});
