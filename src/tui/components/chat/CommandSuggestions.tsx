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
    <Box marginTop={1} flexDirection="column" paddingX={2}>
      {cmds.map((cmd, i) => (
        <Box key={cmd.name} paddingX={1}>
          <Text color={i === selectedIndex ? "cyan" : "dim"} bold={i === selectedIndex}>
            {i === selectedIndex ? "▸ " : "  "}/{cmd.name}
          </Text>
          <Text color="dim"> — {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
