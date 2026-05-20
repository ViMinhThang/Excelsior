import { memo, type FC } from "react";
import { Box, Text, useStdout } from "ink";
import StatusIndicator from "./StatusIndicator.js";
import { theme } from "../../theme.js";
import { createToolDisplay } from "../../lib/toolDisplay.js";
import type { FileChangePreview, FileChangeRow } from "../../lib/toolDisplayTypes.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
  selected?: boolean;
  expanded?: boolean;
}

function basename(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";
  const parts = input.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? input;
}

export function formatCliCommand(toolName?: string, argsStr?: string): string {
  const name = toolName || "tool";
  let args: Record<string, unknown> = {};
  if (argsStr) {
    try {
      const parsed = JSON.parse(argsStr);
      args = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {}
  }

  switch (name) {
    case "view": {
      const filePath = basename(args.filePath || args.path);
      return filePath ? `view ${filePath}` : "view";
    }
    case "ls": {
      const directoryPath = String(args.directoryPath || args.path || ".");
      return `ls ${directoryPath}`;
    }
    case "runCommand":
    case "run_command": {
      const command = String(args.command || args.CommandLine || "");
      const cwd = String(args.cwd || args.Cwd || "");
      return cwd ? `PS ${cwd}> ${command}` : `${command.startsWith("$") ? "" : "$ "}${command}`;
    }
    case "write": {
      const filePath = String(args.filePath || args.path || "");
      return filePath ? `write ${filePath}` : "write";
    }
    case "edit": {
      const filePath = String(args.filePath || args.path || "");
      return filePath ? `edit ${filePath}` : "edit";
    }
    case "spawnSubAgent":
    case "browser_subagent":
      return `subagent ${String(args.role || args.TaskSummary || "")}`;
    default:
      return `${name} ${argsStr ? argsStr.replace(/^{|}$/g, "").trim() : ""}`;
  }
}

interface InlineDiffRow {
  marker: " " | "-" | "+";
  text: string;
  tone: "context" | "removed" | "added";
  lineNumber?: number;
}

function getInlineRowsAndMap(
  oldRows: FileChangeRow[],
  newRows: FileChangeRow[],
): { rows: InlineDiffRow[]; parallelToInlineMap: number[] } {
  const result: InlineDiffRow[] = [];
  const deletions: { row: FileChangeRow; origIndex: number }[] = [];
  const additions: { row: FileChangeRow; origIndex: number }[] = [];
  const parallelToInlineMap: number[] = [];

  const flush = () => {
    for (const del of deletions) {
      parallelToInlineMap[del.origIndex] = result.length;
      result.push({
        marker: "-",
        text: del.row.text,
        tone: "removed",
        lineNumber: del.row.lineNumber,
      });
    }
    for (const add of additions) {
      parallelToInlineMap[add.origIndex] = result.length;
      result.push({
        marker: "+",
        text: add.row.text,
        tone: "added",
        lineNumber: add.row.lineNumber,
      });
    }
    deletions.length = 0;
    additions.length = 0;
  };

  const len = Math.max(oldRows.length, newRows.length);
  for (let i = 0; i < len; i++) {
    const oldRow = oldRows[i];
    const newRow = newRows[i];

    if (oldRow?.tone === "context" || newRow?.tone === "context") {
      flush();
      parallelToInlineMap[i] = result.length;
      const row = newRow?.tone === "context" ? newRow : oldRow;
      result.push({
        marker: " ",
        text: row.text,
        tone: "context",
        lineNumber: row.lineNumber,
      });
    } else {
      if (oldRow && oldRow.tone === "removed") {
        deletions.push({ row: oldRow, origIndex: i });
      }
      if (newRow && newRow.tone === "added") {
        additions.push({ row: newRow, origIndex: i });
      }
      if (!oldRow || oldRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
      if (!newRow || newRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
    }
  }
  flush();

  let lastVal = 0;
  for (let i = 0; i < len; i++) {
    if (parallelToInlineMap[i] === undefined) {
      parallelToInlineMap[i] = lastVal;
    } else {
      lastVal = parallelToInlineMap[i];
    }
  }

  return { rows: result, parallelToInlineMap };
}

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
  const terminalColumns = stdout.columns || 180;
  const isWide = terminalColumns >= 120;
  const previewWidth = Math.max(80, terminalColumns - 6);

  const totalRows = preview.oldRows.length;
  let slicedOldRows = preview.oldRows;
  let slicedNewRows = preview.newRows;
  let slicedInlineRows: InlineDiffRow[] = [];
  let totalInlineRows = 0;
  let inlineStart = 0;

  const { rows: allInlineRows, parallelToInlineMap } = getInlineRowsAndMap(
    preview.oldRows,
    preview.newRows,
  );
  totalInlineRows = allInlineRows.length;

  const viewportHeight = isWide
    ? (pending ? 12 : (focused ? totalRows : Math.min(10, totalRows)))
    : (pending ? 12 : (focused ? totalInlineRows : Math.min(10, totalInlineRows)));

  const isCapped = !pending && !focused && (isWide ? totalRows > 10 : totalInlineRows > 10);

  if (isWide) {
    const start = pending ? Math.min(scrollOffset, Math.max(0, totalRows - viewportHeight)) : 0;
    slicedOldRows = preview.oldRows.slice(start, start + viewportHeight);
    slicedNewRows = preview.newRows.slice(start, start + viewportHeight);
  } else {
    inlineStart = pending ? Math.min(parallelToInlineMap[scrollOffset] ?? 0, Math.max(0, totalInlineRows - viewportHeight)) : 0;
    slicedInlineRows = allInlineRows.slice(inlineStart, inlineStart + viewportHeight);
  }

  const showScrollbar = pending && (isWide ? totalRows > viewportHeight : totalInlineRows > viewportHeight);
  const scrollbarInnerHeight = Math.max(0, viewportHeight - 2);

  let thumbPosition = 0;
  if (showScrollbar) {
    const totalScrollRange = isWide ? totalRows : totalInlineRows;
    const maxScrollPos = Math.max(1, totalScrollRange - viewportHeight);
    const currentScrollPos = isWide ? scrollOffset : inlineStart;
    const scrollRatio = Math.min(1, Math.max(0, currentScrollPos / maxScrollPos));
    thumbPosition = Math.min(
      scrollbarInnerHeight - 1,
      Math.round(scrollRatio * (scrollbarInnerHeight - 1))
    );
  }

  const paneWidth = Math.max(36, Math.floor((previewWidth - (showScrollbar ? 4 : 1)) / 2));
  const actionText = pending ? "pending edit" : `completed ${preview.action}`;
  const hunkInfo = (pending && hunkCount > 0) ? ` (Hunk ${activeHunkIndex + 1}/${hunkCount})` : "";

  return (
    <Box flexDirection="column" marginTop={1} width={previewWidth}>
      <Box flexDirection="row" gap={1} marginBottom={0} width={previewWidth}>
        <Text color={pending ? theme.colors.highlightAction : theme.colors.success} bold>
          {pending ? "●" : "✔"}
        </Text>
        <Text color={theme.colors.text} bold>{actionText}:</Text>
        <Text color={theme.colors.accent} bold>{preview.filePath}</Text>
        <Text color={theme.colors.muted}>{hunkInfo}</Text>
        <Text color={theme.colors.success}>(+{preview.added})</Text>
        <Text color={theme.colors.error}>(-{preview.removed})</Text>
      </Box>

      <Box flexDirection="row" gap={1} marginTop={1} width={previewWidth}>
        {isWide ? (
          <>
            <FileChangePane
              title={preview.oldTitle}
              rows={slicedOldRows}
              width={paneWidth}
              color={theme.colors.error}
              emptyText={preview.action === "create" ? "(empty)" : ""}
            />
            <FileChangePane
              title={preview.newTitle}
              rows={slicedNewRows}
              width={paneWidth}
              color={theme.colors.success}
            />
          </>
        ) : (
          <FileChangeInlineView
            rows={slicedInlineRows}
            width={previewWidth - (showScrollbar ? 4 : 0)}
            emptyText={preview.action === "create" ? "(empty)" : ""}
          />
        )}

        {showScrollbar && (
          <Box flexDirection="column" marginLeft={1} marginTop={1}>
            <Text color={theme.colors.border}>▲</Text>
            {Array.from({ length: scrollbarInnerHeight }).map((_, idx) => {
              const isThumb = idx === thumbPosition;
              return (
                <Text key={idx} color={isThumb ? theme.colors.accent : theme.colors.border}>
                  {isThumb ? "█" : "░"}
                </Text>
              );
            })}
            <Text color={theme.colors.border}>▼</Text>
          </Box>
        )}
      </Box>

      {isCapped && (
        <Box marginTop={1} paddingLeft={1}>
          <Text color={theme.colors.muted} dimColor>
            {`↳ +${preview.added} -${preview.removed} lines changed · Press Ctrl+T to inspect full diff`}
          </Text>
        </Box>
      )}
    </Box>
  );
};

const ToolMessage: FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
  nested = false,
  selected = false,
  expanded = false,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const cmd = formatCliCommand(toolName, toolArgs);
  const showCompletion = display.showCompletion !== false;
  const hasDetail = Boolean(
    display.detail || display.resultPreview?.length || display.fileChangePreview,
  );
  const showBody = Boolean(
    display.fileChangePreview
      || (expanded && (hasDetail || (status === "completed" && showCompletion))),
  );
  const commandColor = selected
    ? theme.colors.highlightSelected
    : theme.colors.muted;

  const collapsedSummary = !expanded && hasDetail && !display.fileChangePreview
    ? display.detail || (
        display.resultPreview ? `→ ${display.resultPreview.length} line${display.resultPreview.length !== 1 ? "s" : ""}${display.omittedResultLines ? ` + ${display.omittedResultLines} more` : ""}` : null
      )
    : null;

  const innerContent = (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" gap={1}>
        <Text color={selected ? theme.colors.highlightSelected : theme.colors.border}>
          {selected ? "›" : " "}
        </Text>
        <StatusIndicator status={status} />
        <Text color={commandColor} dimColor={!selected}>
          {cmd}
        </Text>
        {collapsedSummary && (
          <Text color={theme.colors.muted} dimColor>
            {" · "}{collapsedSummary}
          </Text>
        )}
      </Box>
      {showBody && (
        <Box flexDirection="column" paddingLeft={2} width="100%">
          {display.detail && !display.fileChangePreview ? (
            <Text color={theme.colors.muted} dimColor>↳ {display.detail}</Text>
          ) : null}
          {display.fileChangePreview ? (
            <FileChangePreviewView
              command={cmd}
              preview={display.fileChangePreview}
              pending={false}
              focused={selected || expanded}
            />
          ) : null}
          {display.resultPreview?.map((line, index) => {
            const prefix = !display.detail && index === 0 ? "↳ " : "  ";
            return <Text key={`preview_line_${index}`} color={theme.colors.muted} dimColor>{prefix}{line}</Text>;
          })}
          {display.omittedResultLines && !display.fileChangePreview ? (
            <Text color={theme.colors.muted} dimColor>  … ({display.omittedResultLines} more lines)</Text>
          ) : null}
          {status === "completed" && !hasDetail && showCompletion && (
            <Text color={theme.colors.muted} dimColor>↳ Completed</Text>
          )}
        </Box>
      )}
    </Box>
  );

  return (
    <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
