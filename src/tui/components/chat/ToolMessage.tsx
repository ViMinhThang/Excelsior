import React, { memo } from "react";
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
}

function formatCliCommand(toolName?: string, argsStr?: string): string {
  const name = toolName || "tool";
  let args: Record<string, any> = {};
  if (argsStr) {
    try {
      args = JSON.parse(argsStr);
    } catch {}
  }

  switch (name) {
    case "runCommand":
    case "run_command": {
      const command = args.command || args.CommandLine || "";
      const cwd = args.cwd || args.Cwd || "";
      return cwd ? `PS ${cwd}> ${command}` : `${command.startsWith("$") ? "" : "$ "}${command}`;
    }
    case "spawnSubAgent":
    case "browser_subagent":
      return `subagent ${args.role || args.TaskSummary || ""}`;
    default:
      return `${name} ${argsStr ? argsStr.replace(/^{|}$/g, "").trim() : ""}`;
  }
}

const ToolMessage: React.FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
  nested = false,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });
  const cmd = formatCliCommand(toolName, toolArgs);
  const innerContent = (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <StatusIndicator status={status} />
        <Text color={theme.colors.muted} dimColor>
          {cmd}
        </Text>
      </Box>
      {(display.detail || display.resultPreview?.length || status === "completed") && (
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
          {status === "completed" && (
            <Text color={theme.colors.muted} dimColor>
              {(!display.detail && (!display.resultPreview || display.resultPreview.length === 0)) ? "↳ " : "  "}Completed
            </Text>
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
