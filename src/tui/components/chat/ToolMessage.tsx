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

const ToolMessage: React.FC<ToolMessageProps> = ({ toolName, toolArgs, status = "completed", content, marginTop, nested = false }) => {
  const display = createToolDisplay({ toolName, toolArgs, status, content });

  const innerContent = (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <StatusIndicator status={status} />
        <Text color={theme.colors.muted} dimColor>
          {display.label}{theme.glyphs.separator}{display.summary}
        </Text>
      </Box>
      {(display.detail || display.resultPreview?.length) && (
        <Box flexDirection="column" paddingLeft={nested ? 2 : theme.spacing.toolIndent}>
          {display.detail ? <Text color={theme.colors.muted} dimColor>{nested ? "↳ " : ""}{display.detail}</Text> : null}
          {display.resultPreview?.map((line, index) => (
            <Text key={index} color={theme.colors.muted} dimColor>{theme.glyphs.output} {line}</Text>
          ))}
          {display.omittedResultLines ? (
            <Text color={theme.colors.muted} dimColor>{theme.glyphs.output} … {display.omittedResultLines} more line{display.omittedResultLines === 1 ? "" : "s"}</Text>
          ) : null}
        </Box>
      )}
    </Box>
  );

  return (
    <Box paddingX={nested ? 1 : 2} marginTop={marginTop} marginBottom={nested ? 0 : 1}>
      {innerContent}
    </Box>
  );
};

export default memo(ToolMessage);
