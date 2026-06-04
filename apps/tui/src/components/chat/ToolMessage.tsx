import { memo, type FC } from "react";
import { Box, Text } from "ink";
import { createToolDisplay, normalizeToolText } from "@excelsior/core";
import StatusIndicator from "./StatusIndicator.js";
import { theme } from "../../theme.js";
import { FileChangePreviewView } from "../../features/fileChangePreview/FileChangePreviewView.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
  expanded?: boolean;
}

const MAX_PROGRESS_LINES = 8;
const MAX_PROGRESS_LINE_LENGTH = 120;

const ToolHeader: FC<{
  status: "pending" | "completed" | "error";
  cmd: string;
  activity?: string;
  expandable?: boolean;
}> = ({ status, cmd, activity, expandable }) => {
  const match = cmd.match(/^([a-zA-Z0-9_-]+)\((.*)\)$/);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={theme.colors.border}> </Text>
      <StatusIndicator status={status} />
      {match ? (
        <Box flexDirection="row">
          <Text color={theme.colors.highlightBrand} bold>{match[1]}</Text>
          <Text color={theme.colors.muted}>({match[2]})</Text>
        </Box>
      ) : (
        <Text color={theme.colors.muted}>
          {cmd}
        </Text>
      )}
      {activity ? (
        <Text color={theme.colors.muted}>
          {activity}
        </Text>
      ) : null}
      {expandable && (
        <Text color={theme.colors.muted}>
          (Ctrl+O to expand)
        </Text>
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
  expanded = false,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const cmd = display.command;
  const isPendingFileAction = status === "pending" && isFileActionTool(toolName);
  const progressLines = isPendingFileAction && expanded ? buildWritingProgressLines(toolArgs) : [];
  const activity = isPendingFileAction ? "Writing..." : undefined;
  if (isPendingFileAction && expanded) {
    display.detail = progressLines.join("\n");
    display.fileChangePreview = undefined;
    display.showCompletion = false;
  }

  if (!expanded) {
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <ToolHeader status={status} cmd={cmd} activity={activity} expandable />
        </Box>
      </Box>
    );
  }

  if (toolName === "view" || toolName === "ls" || toolName === "glob") {
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <ToolHeader status={status} cmd={cmd} activity={activity} expandable />
          {display.summaryLine && (
            <Box flexDirection="row" paddingLeft={2}>
              <Text color={theme.colors.muted}>
                └── {display.summaryLine}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  const showCompletion = display.showCompletion !== false;
  const hasDetail = Boolean(
    display.detail || display.resultPreview?.length || display.fileChangePreview,
  );
  const showBody = Boolean(
    isPendingFileAction
      || display.fileChangePreview
      || (expanded && (hasDetail || (status === "completed" && showCompletion))),
  );

  const innerContent = (
    <Box flexDirection="column" width="100%">
      <ToolHeader status={status} cmd={cmd} activity={activity} />
      {showBody && (
        <Box flexDirection="column" paddingLeft={2} width="100%">
          {display.detail && !display.fileChangePreview ? (
            <Text color={theme.colors.muted}>↳ {display.detail}</Text>
          ) : null}
          {display.fileChangePreview ? (
            <FileChangePreviewView
              command={cmd}
              preview={display.fileChangePreview}
              pending={false}
              focused={expanded}
            />
          ) : (
            normalizeToolText(content).split(/\r?\n/).map((line, index) => {
              const prefix = !display.detail && index === 0 ? "↳ " : "  ";
              return <Text key={`preview_line_${index}`} color={theme.colors.muted}>{prefix}{line}</Text>;
            })
          )}
          {status === "completed" && !hasDetail && showCompletion && (
            <Text color={theme.colors.muted}>↳ Completed</Text>
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

function isFileActionTool(toolName?: string): boolean {
  return toolName === "write" ||
    toolName === "writeFile" ||
    toolName === "edit" ||
    toolName === "editFile";
}

function buildWritingProgressLines(rawArgs?: string): string[] {
  const raw = rawArgs ?? "";
  const filePath = extractJsonString(raw, "filePath") || extractJsonString(raw, "path");
  const body = extractJsonString(raw, "content") || extractJsonString(raw, "newText");
  const lines = ["Writing..."];

  if (filePath) lines.push(`target: ${filePath}`);
  if (raw.length > 0) lines.push(`received ${raw.length} chars of tool input`);

  const previewSource = body || raw;
  const previewLines = previewSource
    ? normalizeProgressText(previewSource).split(/\r?\n/).filter(Boolean)
    : [];
  if (previewLines.length > 0) {
    lines.push("preview:");
    lines.push(...previewLines.slice(0, MAX_PROGRESS_LINES).map(truncateProgressLine));
    if (previewLines.length > MAX_PROGRESS_LINES) {
      lines.push(`... ${previewLines.length - MAX_PROGRESS_LINES} more lines`);
    }
  } else {
    lines.push("waiting for streamed tool input");
  }

  return lines;
}

function extractJsonString(raw: string, key: string): string {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex === -1) return "";
  const colonIndex = raw.indexOf(":", keyIndex);
  if (colonIndex === -1) return "";
  const quoteIndex = raw.indexOf("\"", colonIndex + 1);
  if (quoteIndex === -1) return "";

  let escaped = false;
  let value = "";
  for (let index = quoteIndex + 1; index < raw.length; index++) {
    const char = raw[index];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") break;
    value += char;
  }

  return normalizeProgressText(value);
}

function normalizeProgressText(value: string): string {
  try {
    const parsed = JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
    if (typeof parsed === "string") return parsed;
  } catch {
  }
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

function truncateProgressLine(line: string): string {
  const trimmed = line.trimEnd();
  if (trimmed.length <= MAX_PROGRESS_LINE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_PROGRESS_LINE_LENGTH - 3)}...`;
}

export default memo(ToolMessage);
