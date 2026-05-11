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

function renderCommandWithPathHighlight(cmdText: string): React.ReactNode {
  const pathRegex = /\b([\w-]+\/(?:[\w-]+\/)*[\w-]+\.(?:ts|tsx|js|jsx|json|py|md|css|html|yml|yaml|sh))\b/g;
  const segments: { text: string; isPath: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = pathRegex.exec(cmdText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: cmdText.slice(lastIndex, match.index), isPath: false });
    }
    segments.push({ text: match[0], isPath: true });
    lastIndex = pathRegex.lastIndex;
  }

  if (lastIndex < cmdText.length) {
    segments.push({ text: cmdText.slice(lastIndex), isPath: false });
  }

  if (segments.length === 0) {
    return cmdText;
  }

  return segments.map((seg, idx) => (
    <Text key={idx} color={seg.isPath ? "#88c0d0" : undefined} bold={seg.isPath}>
      {seg.text}
    </Text>
  ));
}

const ToolMessage: React.FC<ToolMessageProps> = ({ toolName, toolArgs, status = "completed", content, marginTop, nested = false }) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });

  const cmd = formatCliCommand(toolName, toolArgs);

  const innerContent = (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <StatusIndicator status={status} />
        <Text color={theme.colors.muted}>
          {renderCommandWithPathHighlight(cmd)}
        </Text>
      </Box>
      {(display.detail || display.resultPreview?.length || status === "completed") && (
        <Box flexDirection="column" paddingLeft={2}>
          {display.detail ? (
            <Text color={theme.colors.muted} dimColor>↳ {display.detail}</Text>
          ) : null}
          {display.resultPreview?.map((line, index) => {
            const key = `preview_line_${index}`;
            const prefix = (!display.detail && index === 0) ? "↳ " : "  ";
            return (
              <Text key={key} color={theme.colors.muted} dimColor>{prefix}{line}</Text>
            );
          })}
          {display.omittedResultLines ? (
            <Text color={theme.colors.muted} dimColor>  … ({display.omittedResultLines} more lines)</Text>
          ) : null}
          {status === "completed" && (
            <Text color={theme.colors.muted} dimColor>{(!display.detail && (!display.resultPreview || display.resultPreview.length === 0)) ? "↳ " : "  "}Completed</Text>
          )}
        </Box>
      )}
    </Box>
  );

  return (
    <Box 
      marginTop={marginTop} 
      marginBottom={nested ? 0 : 1}
    >
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
