import React, { memo } from 'react';
import { Box, Text } from 'ink';
import StatusIndicator from './StatusIndicator.js';
import { createToolDisplay } from '../../lib/toolDisplay.js';

interface ToolMessageProps {
  toolName?: string;
  toolArgs?: string;
  status?: "pending" | "completed" | "error";
  content: string;
  marginTop?: number;
}

const riskColor = (risk?: string) => {
  if (risk === "high") return "red";
  if (risk === "medium") return "yellow";
  return "green";
};

const labelColor = (tone: string) => {
  if (tone === "error") return "red";
  if (tone === "pending") return "cyan";
  return "white";
};

const ToolMessage: React.FC<ToolMessageProps> = ({
  toolName,
  toolArgs,
  status = "completed",
  content,
  marginTop,
}) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });

  return (
    <Box flexDirection="column" marginTop={marginTop} marginBottom={1} paddingX={1}>
      <Box>
        <StatusIndicator status={status} />
        <Text color={labelColor(display.tone)}>
          <Text bold> {display.label}</Text>
          <Text color="dim"> - {display.summary}</Text>
          {display.risk ? <Text color={riskColor(display.risk)}> [{display.risk}]</Text> : null}
        </Text>
      </Box>
      {(display.detail || display.resultPreview?.length) && (
        <Box flexDirection="column" paddingLeft={3}>
          {display.detail ? <Text color="dim">{display.detail}</Text> : null}
          {display.resultPreview?.map((line, index) => (
            <Text key={index} color="dim">| {line}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default memo(ToolMessage);
