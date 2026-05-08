import React, { memo } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";

interface DiffViewerProps {
  diff: string;
}

const MAX_DIFF_LINES = 200;

const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const allLines = diff.split("\n");
  const truncated = allLines.length > MAX_DIFF_LINES;
  const lines = allLines.slice(0, MAX_DIFF_LINES);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {lines.map((line, i) => {
        if (line.startsWith("+")) {
          return (
            <Box key={i}>
              <Text color={theme.colors.success}>{line}</Text>
            </Box>
          );
        }
        if (line.startsWith("-")) {
          return (
            <Box key={i}>
              <Text color={theme.colors.error}>{line}</Text>
            </Box>
          );
        }
        if (line.startsWith("@")) {
          return (
            <Box key={i}>
              <Text color={theme.colors.activity}>{line}</Text>
            </Box>
          );
        }
        return (
          <Box key={i}>
            <Text color={theme.colors.muted}>{line}</Text>
          </Box>
        );
      })}
      {truncated && (
        <Box>
          <Text color={theme.colors.muted} dimColor>... (diff truncated at {MAX_DIFF_LINES} lines)</Text>
        </Box>
      )}
    </Box>
  );
};

export default memo(DiffViewer);
