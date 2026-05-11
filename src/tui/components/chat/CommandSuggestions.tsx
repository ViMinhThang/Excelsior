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
      {cmds.slice(0, maxVisibleCount).map((cmd, i) => {
        const isSelected = i === selectedIndex;
        const nameStr = `/${cmd.name}`;
        const paddedName = nameStr.length < 20 ? nameStr.padEnd(20, ' ') : `${nameStr} `;

        return (
          <Box key={cmd.name} paddingLeft={0}>
            <Text color={isSelected ? "#31a8ff" : "#4c566a"} bold={isSelected}>
              {paddedName}{cmd.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
