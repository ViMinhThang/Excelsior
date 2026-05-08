import React, { memo } from "react";
import { Box, Text } from "ink";
import { theme } from "../../theme.js";

interface DiffViewerProps {
  diff: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  const lines = diff.split("\n").slice(0, 200);

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
    </Box>
  );
};

export default memo(DiffViewer);
