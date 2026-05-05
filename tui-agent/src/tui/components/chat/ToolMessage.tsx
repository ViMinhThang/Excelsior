import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content: string;
}

const ToolMessage: React.FC<ToolMessageProps> = ({ toolName, toolArgs, status }) => {
  const isPending = status === "pending";
  const isError = status === "error";
  const tag = isPending ? "RUN" : isError ? "ERR" : "OK";
  
  const color = isError ? "red" : "gray"

  return (
    <Box marginBottom={1} paddingX={1}>
      <Text color={color} dimColor={isPending}>
        <Text bold>[{tag}]</Text> {toolName || "Tool"}{toolName && toolArgs ? ` (${toolArgs})` : ""}
      </Text>
    </Box>
  );
};

export default memo(ToolMessage);
