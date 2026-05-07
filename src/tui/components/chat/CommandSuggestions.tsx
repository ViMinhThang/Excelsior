import React, { memo } from "react";
import { Box, Text } from "ink";
import { Command } from "../../../types.js";

interface CommandSuggestionsProps {
  commands: Command[];
  selectedIndex: number;
  maxVisibleCount: number;
}

function CommandSuggestionsInner({ commands: cmds, selectedIndex, maxVisibleCount }: CommandSuggestionsProps) {
  if (cmds.length === 0) return null;

  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} height={maxVisibleCount + 2}>
      {cmds.map((cmd, i) => (
        <Box key={cmd.name} backgroundColor={i === selectedIndex ? "#453d3d" : undefined} paddingX={1}>
          <Text color={i === selectedIndex ? "white" : "dim"} bold={i === selectedIndex}>
            /{cmd.name}
          </Text>
          <Text color="dim"> — {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
