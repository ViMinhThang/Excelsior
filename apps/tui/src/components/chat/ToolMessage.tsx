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
            <Text color={theme.colors.muted} dimColor>
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
}> = ({ command, preview }) => {
  const { stdout } = useStdout();
  const terminalColumns = stdout.columns || 180;
  const previewWidth = Math.max(100, terminalColumns - 6);
  const paneWidth = Math.max(44, Math.floor((previewWidth - 1) / 2));

  return (
    <Box flexDirection="column" marginTop={1} width={previewWidth}>
      <Text color={theme.colors.muted} dimColor>
        {command} (+{preview.added} -{preview.removed})
      </Text>
      <Box flexDirection="row" gap={1} marginTop={1} width={previewWidth}>
        <FileChangePane
          title={preview.oldTitle}
          rows={preview.oldRows}
          width={paneWidth}
          color={theme.colors.error}
          emptyText={preview.action === "create" ? "(empty)" : ""}
        />
        <FileChangePane
          title={preview.newTitle}
          rows={preview.newRows}
          width={paneWidth}
          color={theme.colors.success}
        />
      </Box>
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
            <FileChangePreviewView command={cmd} preview={display.fileChangePreview} />
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
