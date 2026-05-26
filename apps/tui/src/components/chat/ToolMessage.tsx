import { memo, type FC } from "react";
import { Box, Text } from "ink";
import StatusIndicator from "./StatusIndicator.js";
import { theme } from "../../theme.js";
import { createToolDisplay } from "../../lib/toolDisplay.js";
import { FileChangePreviewView } from "../../features/fileChangePreview/FileChangePreviewView.js";
import { normalizeToolText } from "../../lib/toolDisplayUtils.js";

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
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
      return filePath ? `read ${filePath}` : "read";
    }
    case "ls": {
      const directoryPath = String(args.directoryPath || args.path || ".");
      return `Listfiles ${directoryPath}`;
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



function asString(val: unknown): string {
  return typeof val === "string" ? val : String(val ?? "");
}

function getToolSummaryLine(
  toolName?: string,
  toolArgs?: string,
  content?: string,
): string {
  const name = toolName || "tool";
  let args: Record<string, unknown> = {};
  if (toolArgs) {
    try {
      const parsed = JSON.parse(toolArgs);
      args = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {}
  }

  const normalizedContent = normalizeToolText(content).trim();

  if (name === "view") {
    if (normalizedContent.startsWith("Error reading file:")) {
      return normalizedContent;
    }
    const totalLines = normalizedContent ? normalizedContent.split("\n").length : 0;
    return `Read ${totalLines} lines`;
  }

  if (name === "ls") {
    if (normalizedContent.startsWith("Error listing directory:")) {
      return normalizedContent;
    }
    const lines = normalizedContent.split("\n").filter(Boolean);
    const folders = lines.filter(l => l.endsWith("/")).length;
    const files = lines.filter(l => l && !l.endsWith("/")).length;
    return `${files} files, ${folders} folders`;
  }

  if (name === "glob") {
    if (normalizedContent.startsWith("Error")) {
      return normalizedContent;
    }
    const filesCount = normalizedContent ? normalizedContent.split("\n").filter(Boolean).length : 0;
    return `Found ${filesCount} files`;
  }

  if (name === "write" || name === "edit") {
    const lines = normalizedContent.split("\n").filter(Boolean);
    const diffLines = lines.slice(1);
    const added = diffLines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const removed = diffLines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
    if (added + removed > 0) {
      return `${asString(args.filePath)} (+${added} -${removed} lines changed)`;
    }
    return lines[0] || "Completed";
  }

  if (name === "runCommand" || name === "run_command") {
    if (normalizedContent.startsWith("Error executing command")) {
      return "Command failed";
    }
    if (normalizedContent === "Command timed out") {
      return "Timed out";
    }
    const totalLines = normalizedContent ? normalizedContent.split("\n").length : 0;
    return `Completed with ${totalLines} lines of output`;
  }

  return "Completed";
}

const ToolMessage: FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
  nested = false,
  expanded = false,
}) => {
  const cmd = formatCliCommand(toolName, toolArgs);

  if (!expanded) {
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <Box flexDirection="row" gap={1}>
            <Text color={theme.colors.border}> </Text>
            <StatusIndicator status={status} />
            <Text color={theme.colors.muted} dimColor>
              {cmd}
            </Text>
            <Text color={theme.colors.muted} dimColor>
              (Ctrl+O to expand)
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // If expanded and it's "view", "ls", or "glob", ONLY render the summary line!
  if (toolName === "view" || toolName === "ls" || toolName === "glob") {
    const summaryLine = getToolSummaryLine(toolName, toolArgs, content);
    return (
      <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1} width="100%">
        <Box flexDirection="column" width="100%">
          <Box flexDirection="row" gap={1}>
            <Text color={theme.colors.border}> </Text>
            <StatusIndicator status={status} />
            <Text color={theme.colors.muted} dimColor>
              {cmd}
            </Text>
            <Text color={theme.colors.muted} dimColor>
              (Ctrl+O to expand)
            </Text>
          </Box>
          {summaryLine && (
            <Box flexDirection="row" paddingLeft={2}>
              <Text color={theme.colors.muted} dimColor>
                └── {summaryLine}
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Otherwise, use the original rich rendering logic for edit/write/runCommand!
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const showCompletion = display.showCompletion !== false;
  const hasDetail = Boolean(
    display.detail || display.resultPreview?.length || display.fileChangePreview,
  );
  const showBody = Boolean(
    display.fileChangePreview
      || (expanded && (hasDetail || (status === "completed" && showCompletion))),
  );

  const innerContent = (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.border}> </Text>
        <StatusIndicator status={status} />
        <Text color={theme.colors.muted} dimColor>
          {cmd}
        </Text>
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
              focused={expanded}
            />
          ) : (
            normalizeToolText(content).split(/\r?\n/).map((line, index) => {
              const prefix = !display.detail && index === 0 ? "↳ " : "  ";
              return <Text key={`preview_line_${index}`} color={theme.colors.muted} dimColor>{prefix}{line}</Text>;
            })
          )}
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
