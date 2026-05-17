import { memo, type FC } from "react";
import { Box, Text } from "ink";
import StatusIndicator from "./StatusIndicator.js";
import { theme } from "../../theme.js";
import { createToolDisplay } from "../../lib/toolDisplay.js";

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
  const hasDetail = Boolean(display.detail || display.resultPreview?.length);
  const showBody = Boolean(
    expanded && (hasDetail || (status === "completed" && showCompletion)),
  );
  const commandColor = selected
    ? theme.colors.highlightSelected
    : theme.colors.muted;

  const collapsedSummary = !expanded && hasDetail
    ? display.detail || (
        display.resultPreview ? `→ ${display.resultPreview.length} line${display.resultPreview.length !== 1 ? "s" : ""}${display.omittedResultLines ? ` + ${display.omittedResultLines} more` : ""}` : null
      )
    : null;

  const innerContent = (
    <Box flexDirection="column">
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
        <Box flexDirection="column" paddingLeft={2}>
          {display.detail ? (
            <Text color={theme.colors.muted} dimColor>↳ {display.detail}</Text>
          ) : null}
          {display.resultPreview?.map((line, index) => {
            const prefix = !display.detail && index === 0 ? "↳ " : "  ";
            return <Text key={`preview_line_${index}`} color={theme.colors.muted} dimColor>{prefix}{line}</Text>;
          })}
          {display.omittedResultLines ? (
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
    <Box marginTop={marginTop} paddingLeft={1} paddingBottom={nested ? 0 : 1}>
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
