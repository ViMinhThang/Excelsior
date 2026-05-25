import { memo, type Dispatch, type FC, type SetStateAction } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { CommandDefinition } from "@excelsior/core";
import { theme } from "../../theme.js";

export interface CommandPaletteProps {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  selectedIndex: number;
  filtered: CommandDefinition[];
  total: number;
  next: () => void;
  prev: () => void;
  insertCommand: () => void;
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

const LEFT_BORDER_STYLE = {
  top: "",
  bottom: "",
  left: theme.glyphs.output,
  right: "",
  topLeft: "",
  topRight: "",
  bottomLeft: "",
  bottomRight: ""
};

const CommandPalette: FC<CommandPaletteProps> = ({
  search,
  setSearch,
  selectedIndex,
  filtered,
  total,
  next,
  prev,
  insertCommand,
  close,
}) => {
  const { stdout } = useStdout();
  const width = stdout?.columns || 80;
  const isSplit = width >= 80;

  const totalCommands = total;

  useInput((input, key) => {
    if (key.escape) {
      close();
      return;
    }
    if (key.return) {
      insertCommand();
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
      setSearch((prev) => prev.slice(0, -1));
      return;
    }
    if (key.tab && filtered.length > 0) {
      const cmd = filtered[selectedIndex];
      if (cmd) setSearch(cmd.name);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setSearch((prev) => prev + input);
    }
  });

  const groups = groupCommands(filtered);
  let flatIndex = 0;
  const selectedCommand = filtered[selectedIndex];

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="single" borderColor={theme.colors.border}>
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.highlightBrand} bold>Commands</Text>
        <Text color={theme.colors.muted}>{theme.glyphs.section}</Text>
        <Text color={theme.colors.highlightBrand}>{">"}</Text>
        <Text color={theme.colors.text}>/{search}</Text>
        <Text color={theme.colors.muted} dimColor>
          ({filtered.length}/{totalCommands})
        </Text>
      </Box>

      <Box flexDirection="row" marginTop={1} width="100%">
        {/* Left Column - Commands List */}
        <Box flexDirection="column" flexGrow={1} flexBasis={0} marginRight={isSplit ? 1 : 0}>
          {filtered.length === 0 ? (
            <Box paddingLeft={1}>
              <Text color={theme.colors.muted} italic>No commands found</Text>
            </Box>
          ) : (
            Array.from(groups.entries()).map(([category, cmds]) => (
              <Box key={category} flexDirection="column">
                <Text color={theme.colors.highlightHeading} bold>
                  {category}:
                </Text>
                {cmds.map((cmd) => {
                  const isSelected = flatIndex === selectedIndex;
                  flatIndex++;

                  // Truncate descriptions to preserve layout
                  const descLimit = isSplit ? 45 : 30;
                  const cleanDesc = cmd.description.length > descLimit
                    ? cmd.description.substring(0, descLimit - 3) + "..."
                    : cmd.description;

                  return (
                    <Box
                      key={cmd.name}
                      flexDirection="row"
                      gap={1}
                      paddingLeft={1}
                      backgroundColor={isSelected ? theme.colors.panel : undefined}
                    >
                      <Text color={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                        {isSelected ? ">" : " "}
                      </Text>
                      <Text
                        color={isSelected ? theme.colors.highlightSelected : theme.colors.text}
                        bold={isSelected}
                      >
                        /{cmd.name}
                      </Text>
                      <Text color={isSelected ? theme.colors.secondary : theme.colors.muted} dimColor={!isSelected}>
                        {cleanDesc}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            ))
          )}
        </Box>

        {/* Right Column - selection Preview Panel */}
        {isSplit && selectedCommand && (
          <Box
            flexDirection="column"
            flexGrow={1}
            flexBasis={0}
            paddingLeft={2}
            borderStyle={LEFT_BORDER_STYLE}
            borderColor={theme.colors.border}
          >
            <Box flexDirection="row" gap={1}>
              <Text color={theme.colors.highlightHeading} bold>/{selectedCommand.name}</Text>
              <Text color={theme.colors.muted} dimColor>·</Text>
              <Text color={theme.colors.activity} italic>{selectedCommand.category || "general"}</Text>
            </Box>

            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.colors.highlightBrand} bold>Description:</Text>
              <Text color={theme.colors.text}>{selectedCommand.description}</Text>
            </Box>

            {selectedCommand.usage && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={theme.colors.highlightBrand} bold>Usage:</Text>
                <Text color={theme.colors.highlightInline} italic>{selectedCommand.usage}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.colors.muted} dimColor>
          Type to filter - Up/Down navigate - Enter insert - Esc close - Tab autocomplete
        </Text>
      </Box>
    </Box>
  );
};

export default memo(CommandPalette);

