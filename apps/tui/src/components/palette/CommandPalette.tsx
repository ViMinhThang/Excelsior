import { memo, useCallback, type Dispatch, type FC, type SetStateAction } from "react";
import { decodePasteBytes } from "@opentui/core";
import { usePaste, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { CommandDefinition } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { useKeyboardInput } from "../../platform/opentui/useKeyboardInput.js";
import { useKeymap } from "../../hooks/useKeymap.js";
import { isClipboardShortcut, sanitizeSingleLinePaste } from "../../lib/input/textInput.js";
import { copyTextToClipboard, readTextFromClipboard } from "../../platform/clipboard.js";

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
  const renderer = useRenderer();
  const { width } = useTerminalDimensions();
  const isSplit = width >= 80;

  const applyPaste = useCallback((rawText: string) => {
    const text = sanitizeSingleLinePaste(rawText);
    if (!text) return;
    setSearch((previous) => previous + text);
  }, [setSearch]);

  useKeymap(
    {
      "ctrl+c": () => copyTextToClipboard(search, renderer),
      "ctrl+v": () => {
        void readTextFromClipboard().then(applyPaste);
      },
      "meta+c": () => copyTextToClipboard(search, renderer),
      "meta+v": () => {
        void readTextFromClipboard().then(applyPaste);
      },
    },
    { priority: 150 },
  );

  usePaste(useCallback((event) => {
    applyPaste(decodePasteBytes(event.bytes));
  }, [applyPaste]));

  useKeyboardInput(useCallback((input, key) => {
    if (isClipboardShortcut(input, key)) {
      return;
    }
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
      setSearch((previous) => previous.slice(0, -1));
      return;
    }
    if (key.tab && filtered.length > 0) {
      const cmd = filtered[selectedIndex];
      if (cmd) setSearch(cmd.name);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setSearch((previous) => previous + input);
    }
  }, [
    close,
    insertCommand,
    prev,
    next,
    setSearch,
    filtered,
    selectedIndex,
  ]));

  const groups = groupCommands(filtered);
  let flatIndex = 0;
  const selectedCommand = filtered[selectedIndex];

  return (
    <box
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      border
      borderStyle="single"
      borderColor={theme.colors.border}
    >
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.highlightBrand} attributes={textAttrs({ bold: true })}>
          Commands
        </text>
        <text fg={theme.colors.muted}>{theme.glyphs.section}</text>
        <text fg={theme.colors.highlightBrand}>{">"}</text>
        <text fg={theme.colors.text}>/{search}</text>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          ({filtered.length}/{total})
        </text>
      </box>

      <box flexDirection="row" marginTop={1} width="100%">
        <box
          flexDirection="column"
          flexGrow={1}
          flexBasis={0}
          marginRight={isSplit ? 1 : 0}
        >
          {filtered.length === 0 ? (
            <box paddingLeft={1}>
              <text fg={theme.colors.muted} attributes={textAttrs({ italic: true })}>
                No commands found
              </text>
            </box>
          ) : (
            Array.from(groups.entries()).map(([category, cmds]) => (
              <box key={category} flexDirection="column">
                <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>
                  {category}:
                </text>
                {cmds.map((cmd) => {
                  const isSelected = flatIndex === selectedIndex;
                  flatIndex += 1;

                  const descLimit = isSplit ? 45 : 30;
                  const cleanDesc = cmd.description.length > descLimit
                    ? `${cmd.description.substring(0, descLimit - 3)}...`
                    : cmd.description;

                  return (
                    <box
                      key={cmd.name}
                      flexDirection="row"
                      gap={1}
                      paddingLeft={1}
                      backgroundColor={isSelected ? theme.colors.panel : undefined}
                    >
                      <text fg={isSelected ? theme.colors.highlightSelected : theme.colors.border}>
                        {isSelected ? ">" : " "}
                      </text>
                      <text
                        fg={isSelected ? theme.colors.highlightSelected : theme.colors.text}
                        attributes={textAttrs({ bold: isSelected })}
                      >
                        /{cmd.name}
                      </text>
                      <text
                        fg={isSelected ? theme.colors.secondary : theme.colors.muted}
                        attributes={textAttrs({ dim: !isSelected })}
                      >
                        {cleanDesc}
                      </text>
                    </box>
                  );
                })}
              </box>
            ))
          )}
        </box>

        {isSplit && selectedCommand ? (
          <box
            flexDirection="column"
            flexGrow={1}
            flexBasis={0}
            paddingLeft={2}
            border={["left"]}
            borderColor={theme.colors.border}
          >
            <box flexDirection="row" gap={1}>
              <text fg={theme.colors.highlightHeading} attributes={textAttrs({ bold: true })}>
                /{selectedCommand.name}
              </text>
              <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
                {"\u00b7"}
              </text>
              <text fg={theme.colors.activity} attributes={textAttrs({ italic: true })}>
                {selectedCommand.category || "general"}
              </text>
            </box>

            <box flexDirection="column" marginTop={1}>
              <text fg={theme.colors.highlightBrand} attributes={textAttrs({ bold: true })}>
                Description:
              </text>
              <text fg={theme.colors.text}>{selectedCommand.description}</text>
            </box>

            {selectedCommand.usage ? (
              <box flexDirection="column" marginTop={1}>
                <text fg={theme.colors.highlightBrand} attributes={textAttrs({ bold: true })}>
                  Usage:
                </text>
                <text fg={theme.colors.highlightInline} attributes={textAttrs({ italic: true })}>
                  {selectedCommand.usage}
                </text>
              </box>
            ) : null}
          </box>
        ) : null}
      </box>

      <box marginTop={1}>
        <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
          Type to filter - Up/Down navigate - Enter insert - Esc close - Tab autocomplete
        </text>
      </box>
    </box>
  );
};

export default memo(CommandPalette);