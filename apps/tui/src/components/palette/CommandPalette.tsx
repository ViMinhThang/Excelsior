import { memo, type FC, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { CommandDefinition } from "@excelsior/core";
import { theme } from "../../theme.js";

interface CommandPaletteProps {
  search: string;
  setSearch: (value: string) => void;
  selectedIndex: number;
  filtered: CommandDefinition[];
  total: number;
  next: () => void;
  prev: () => void;
  execute: () => void;
  close: () => void;
}

function groupCommands(commands: CommandDefinition[]): Map<string, CommandDefinition[]> {
  const groups = new Map<string, CommandDefinition[]>();
  for (const cmd of commands) {
    const category = cmd.category || "general";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(cmd);
  }
  return groups;
}

const CommandPalette: FC<CommandPaletteProps> = ({
  search,
  setSearch,
  selectedIndex,
  filtered,
  total,
  next,
  prev,
  execute,
  close,
}) => {
  const [charBuffer, setCharBuffer] = useState(search);
  const totalCommands = total;

  useInput((input, key) => {
    if (key.escape) {
      close();
      return;
    }
    if (key.return) {
      execute();
      return;
    }
    if (key.upArrow) {
      prev();
      return;
    }
    if (key.downArrow) {
      next();
      return;
    }
    if (key.backspace || key.delete) {
      setCharBuffer((prev) => prev.slice(0, -1));
      return;
    }
    if (key.tab && filtered.length > 0) {
      const cmd = filtered[selectedIndex];
      if (cmd) setCharBuffer(cmd.name);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setCharBuffer((prev) => prev + input);
    }
  });

  useEffect(() => {
    setSearch(charBuffer);
  }, [charBuffer, setSearch]);

  const groups = groupCommands(filtered);
  let flatIndex = 0;

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightBrand}>{">"}</Text>
        <Text color={theme.colors.text}>/{charBuffer}</Text>
        <Text color={theme.colors.muted} dimColor>
          ({filtered.length}/{totalCommands})
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1} paddingLeft={1}>
        {Array.from(groups.entries()).map(([category, cmds]) => (
          <Box key={category} flexDirection="column">
            <Text color={theme.colors.highlightHeading} bold dimColor>
              {category}
            </Text>
            {cmds.map((cmd) => {
              const isSelected = flatIndex === selectedIndex;
              flatIndex++;
              return (
                <Box key={cmd.name} flexDirection="row" gap={1} paddingLeft={1}>
                  <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                    {isSelected ? "›" : " "}
                  </Text>
                  <Text
                    color={isSelected ? theme.colors.highlightSelected : theme.colors.text}
                    bold={isSelected}
                  >
                    /{cmd.name}
                  </Text>
                  <Text color={theme.colors.muted} dimColor>
                    {cmd.description}
                  </Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.colors.muted} dimColor>
          Type to filter · ↑↓ navigate · Enter execute · Esc close · Tab autocomplete
        </Text>
      </Box>
    </Box>
  );
};

export default memo(CommandPalette);
