import React, { memo } from 'react';
import { Box, Text } from 'ink';
import StatusIndicator from './StatusIndicator.js';
import { theme } from '../../theme.js';
import { createToolDisplay } from '../../lib/toolDisplay.js';

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content?: string;
  marginTop?: number;
  nested?: boolean;
}

const riskColor = (risk?: string) => {
  if (risk === "high") return theme.colors.error;
  if (risk === "medium") return theme.colors.accent;
  return theme.colors.success;
};

function formatCliCommand(toolName?: string, argsStr?: string): string {
  const name = toolName || "tool";
  let args: Record<string, any> = {};
  if (argsStr) {
    try {
      args = JSON.parse(argsStr);
    } catch {}
  }

  const path = args.path || args.AbsolutePath || args.TargetFile || args.directory || args.DirectoryPath || args.Path || "";

  switch (name) {
    case "readFile":
    case "view_file":
    case "read_file":
      return `read ${path}`;
    case "writeFile":
    case "write_to_file":
      return `write ${path}`;
    case "editFile":
    case "replace_file_content":
    case "multi_replace_file_content":
      return `edit ${path}`;
    case "listFiles":
    case "list_dir":
      return `ls ${path || "."}`;
    case "searchFiles":
    case "grep_search":
      return `grep "${args.query || args.Query || ""}"`;
    case "runCommand":
    case "run_command": {
      const command = args.command || args.CommandLine || "";
      const cwd = args.cwd || args.Cwd || "";
      if (cwd) {
        return `PS ${cwd}> ${command}`;
      }
      return `${command.startsWith("$") ? "" : "$ "}${command}`;
    }
    case "spawnSubAgent":
    case "browser_subagent":
      return `subagent ${args.role || args.TaskSummary || ""}`;
    default:
      return `${name} ${argsStr ? argsStr.replace(/^{|}$/g, "").trim() : ""}`;
  }
}

const ToolMessage: React.FC<ToolMessageProps> = ({ toolName, toolArgs, status = "completed", content, marginTop, nested = false }) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });

  const cmd = formatCliCommand(toolName, toolArgs);
  const header = cmd.startsWith("PS ") || cmd.startsWith("$") ? cmd : ` $ ${cmd}`;

  const innerContent = (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {status === "pending" && <StatusIndicator status={status} />}
        <Text color={theme.colors.muted}>
          {header}
        </Text>
      </Box>
      {(display.detail || display.resultPreview?.length || status === "completed") && (
        <Box flexDirection="column" paddingLeft={0}>
          {display.detail ? <Text color={theme.colors.muted} dimColor>   {display.detail}</Text> : null}
          {display.omittedResultLines ? (
            <Text color={theme.colors.muted} dimColor>   ... ({display.omittedResultLines} earlier lines)</Text>
          ) : null}
          {display.resultPreview?.map((line, index) => (
            <Text key={index} color={theme.colors.muted} dimColor>   {line}</Text>
          ))}
          {status === "completed" && (
            <Text color={theme.colors.muted} dimColor>   Completed</Text>
          )}
        </Box>
      )}
    </Box>
  );

  const bg = theme.colors.toolPanel;

  return (
    <Box 
      backgroundColor={bg} 
      paddingX={1} 
      paddingY={1}
      marginTop={marginTop} 
      marginBottom={nested ? 0 : 1}
    >
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
