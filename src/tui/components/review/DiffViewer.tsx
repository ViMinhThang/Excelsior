import React, { memo } from "react";
import { Box, Text } from "ink";

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
              <Text color="green">{line}</Text>
            </Box>
          );
        }
        if (line.startsWith("-")) {
          return (
            <Box key={i}>
              <Text color="red">{line}</Text>
            </Box>
          );
        }
        if (line.startsWith("@")) {
          return (
            <Box key={i}>
              <Text color="cyan">{line}</Text>
            </Box>
          );
        }
        return (
          <Box key={i}>
            <Text color="dim">{line}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default memo(DiffViewer);
