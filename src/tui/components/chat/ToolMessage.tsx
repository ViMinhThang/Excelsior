import React, { memo } from 'react';
import { Box, Text } from 'ink';
import StatusIndicator from './StatusIndicator.js';

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content: string;
}

const formatArgs = (args?: string) => {
  if (!args) return "";
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed !== 'object' || parsed === null) return args;
    
    return Object.entries(parsed)
      .map(([k, v]) => {
        const val = typeof v === 'string' ? `"${v}"` : JSON.stringify(v);
        return `${k}: ${val}`;
      })
      .join(', ');
  } catch {
    return args.replace(/^{|}$/g, '').trim();
  }
};

const ToolMessage: React.FC<ToolMessageProps> = ({ toolName, toolArgs, status = "completed", content }) => {
  const isPending = status === "pending";
  const formattedArgs = formatArgs(toolArgs);

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Box>
        <StatusIndicator status={status} />
        <Text color="gray" dimColor={isPending}>
          <Text bold> {toolName || "Tool"}</Text>
          {formattedArgs ? <Text> {formattedArgs}</Text> : null}
        </Text>
      </Box>
    </Box>
  );
};

export default memo(ToolMessage);
