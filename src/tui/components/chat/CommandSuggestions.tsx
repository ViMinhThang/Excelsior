import React, { memo } from "react";
import { Box, Text } from "ink";
import { Command } from "../../../types.js";
import { theme } from "../../theme.js";

interface CommandSuggestionsProps {
  commands: Command[];
  selectedIndex: number;
  maxVisibleCount: number;
}

function CommandSuggestionsInner({ commands: cmds, selectedIndex, maxVisibleCount }: CommandSuggestionsProps) {
  if (cmds.length === 0) return null;

  return (
    <Box marginTop={1} flexDirection="column" paddingLeft={1}>
      {cmds.slice(0, maxVisibleCount).map((cmd, i) => (
        <Box key={cmd.name} paddingLeft={0}>
          <Text color={i === selectedIndex ? theme.colors.accent : theme.colors.muted} bold={i === selectedIndex}>
            {i === selectedIndex ? `${theme.glyphs.active} ` : "  "}/{cmd.name}
          </Text>
          <Text color={theme.colors.muted}> {theme.glyphs.section} {cmd.description}</Text>
        </Box>
      ))}
    </Box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
