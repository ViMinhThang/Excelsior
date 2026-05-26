import { type FC } from "react";
import { Box, Text, useStdout } from "ink";
import type {
  FileChangePreview,
  FileChangeRow,
} from "../../lib/toolDisplayTypes.js";
import {
  buildFileChangePreviewFrame,
  type InlineDiffRow,
} from "../../lib/fileChangePreview.js";
import { theme } from "../../theme.js";

const FileChangeInlineView: FC<{
  rows: InlineDiffRow[];
  width: number;
  emptyText?: string;
}> = ({ rows, width, emptyText = "" }) => (
  <Box
    flexDirection="column"
    borderStyle="single"
    borderColor={theme.colors.border}
    paddingX={1}
    width={width}
  >
    {rows.length > 0 ? (
      rows.map((row, index) => {
        let bgColor: string | undefined;
        let textColor: string = theme.colors.text;
        let numColor: string = theme.colors.muted;
        let isDim = false;

        if (row.tone === "removed") {
          bgColor = theme.colors.diffRemovedBackground;
          textColor = theme.colors.error;
          numColor = theme.colors.error;
        } else if (row.tone === "added") {
          bgColor = theme.colors.diffAddedBackground;
          textColor = theme.colors.success;
          numColor = theme.colors.success;
        } else {
          isDim = true;
        }

        return (
          <Box key={`inline_${index}`} backgroundColor={bgColor} width="100%">
            <Box width={7}>
              <Text color={numColor} dimColor={isDim}>
                {`${row.lineNumber === undefined ? "   " : String(row.lineNumber).padStart(3, " ")} ${row.marker} `}
              </Text>
            </Box>
            <Box flexGrow={1}>
              <Text color={textColor} dimColor={isDim} wrap="wrap">
                {row.text}
              </Text>
            </Box>
          </Box>
        );
      })
    ) : (
      <Text color={theme.colors.muted}>{emptyText}</Text>
    )}
  </Box>
);

const FileChangePane: FC<{
  title: string;
  rows: FileChangeRow[];
  width: number;
  color: string;
  emptyText?: string;
}> = ({ title, rows, width, color, emptyText = "" }) => (
  <Box
    flexDirection="column"
    borderStyle="single"
    borderColor={theme.colors.border}
    paddingX={1}
    width={width}
    minWidth={34}
  >
    <Text color={color} bold>{title}</Text>
    {rows.length > 0 ? (
      rows.map((row, index) => (
        <Box
          key={`${title}_${index}`}
          backgroundColor={
            row.tone === "removed" ? theme.colors.diffRemovedBackground
            : row.tone === "added" ? theme.colors.diffAddedBackground
            : undefined
          }
          width="100%"
        >
          <Box width={7}>
            <Text
              color={
                row.tone === "removed" ? theme.colors.error
                : row.tone === "added" ? theme.colors.success
                : theme.colors.muted
              }
              dimColor={row.tone === "context" || row.tone === "empty"}
            >
              {`${row.lineNumber === undefined ? "   " : String(row.lineNumber).padStart(3, " ")} ${row.marker} `}
            </Text>
          </Box>
          <Box flexGrow={1}>
            <Text
              color={theme.colors.text}
              dimColor={row.tone === "context" || row.tone === "empty"}
              wrap="wrap"
            >
              {row.text}
            </Text>
          </Box>
        </Box>
      ))
    ) : (
      <Text color={color}>{emptyText}</Text>
    )}
  </Box>
);

export const FileChangePreviewView: FC<{
  command: string;
  preview: FileChangePreview;
  scrollOffset?: number;
  activeHunkIndex?: number;
  hunkCount?: number;
  pending?: boolean;
  focused?: boolean;
}> = ({
  command: _command,
  preview,
  scrollOffset = 0,
  activeHunkIndex = 0,
  hunkCount = 0,
  pending = false,
  focused = false,
}) => {
  const { stdout } = useStdout();
  const frame = buildFileChangePreviewFrame({
    preview,
    terminalColumns: stdout.columns || 180,
    scrollOffset,
    pending,
    focused,
  });
  const actionText = pending ? "pending edit" : `completed ${preview.action}`;
  const hunkInfo = (pending && hunkCount > 0) ? ` (Hunk ${activeHunkIndex + 1}/${hunkCount})` : "";

  return (
    <Box flexDirection="column" marginTop={1} width={frame.previewWidth}>
      <Box flexDirection="row" gap={1} marginBottom={0} width={frame.previewWidth}>
        <Text color={pending ? theme.colors.highlightAction : theme.colors.success} bold>
          {pending ? "â—" : "âœ”"}
        </Text>
        <Text color={theme.colors.text} bold>{actionText}:</Text>
        <Text color={theme.colors.accent} bold>{preview.filePath}</Text>
        <Text color={theme.colors.muted}>{hunkInfo}</Text>
        <Text color={theme.colors.success}>(+{preview.added})</Text>
        <Text color={theme.colors.error}>(-{preview.removed})</Text>
      </Box>

      <Box flexDirection="row" gap={1} marginTop={1} width={frame.previewWidth}>
        {frame.isWide ? (
          <>
            <FileChangePane
              title={preview.oldTitle}
              rows={frame.oldRows}
              width={frame.paneWidth}
              color={theme.colors.error}
              emptyText={preview.action === "create" ? "(empty)" : ""}
            />
            <FileChangePane
              title={preview.newTitle}
              rows={frame.newRows}
              width={frame.paneWidth}
              color={theme.colors.success}
            />
          </>
        ) : (
          <FileChangeInlineView
            rows={frame.inlineRows}
            width={frame.previewWidth - (frame.showScrollbar ? 4 : 0)}
            emptyText={preview.action === "create" ? "(empty)" : ""}
          />
        )}

        {frame.showScrollbar && (
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Text color={theme.colors.border}>â–²</Text>
            {Array.from({ length: frame.scrollbarInnerHeight }).map((_, idx) => {
              const isThumb = idx === frame.thumbPosition;
              return (
                <Text key={idx} color={isThumb ? theme.colors.accent : theme.colors.border}>
                  {isThumb ? "â–ˆ" : "â–‘"}
                </Text>
              );
            })}
            <Text color={theme.colors.border}>â–¼</Text>
          </Box>
        )}
      </Box>

      {frame.isCapped && (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.colors.muted} dimColor>
            {`â†³ +${preview.added} -${preview.removed} lines changed Â· Press Ctrl+O to inspect commands`}
          </Text>
        </Box>
      )}
    </Box>
  );
};
