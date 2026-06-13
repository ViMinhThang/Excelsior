import { memo } from "react";
import type { CommandDefinition } from "@excelsior/core";
import { theme } from "../../theme.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";

export interface CommandSuggestionsProps {
  commands: CommandDefinition[];
  selectedIndex: number;
  maxVisibleCount: number;
}

function CommandSuggestionsInner({
  commands: cmds,
  selectedIndex,
  maxVisibleCount,
}: CommandSuggestionsProps) {
  if (cmds.length === 0) return null;

  const visibleCount = Math.max(1, Math.min(maxVisibleCount, cmds.length));
  const maxStart = Math.max(0, cmds.length - visibleCount);
  const preferredStart = selectedIndex - Math.floor(visibleCount / 2);
  const startIndex = Math.min(Math.max(0, preferredStart), maxStart);
  const visibleCommands = cmds.slice(startIndex, startIndex + visibleCount);
  const hasHiddenBefore = startIndex > 0;
  const hasHiddenAfter = startIndex + visibleCount < cmds.length;

  return (
    <box marginTop={1} flexDirection="column">
      {hasHiddenBefore ? (
        <text fg={theme.colors.muted}>
          {`... ${startIndex} more above`}
        </text>
      ) : null}
      {visibleCommands.map((cmd, visibleIndex) => {
        const commandIndex = startIndex + visibleIndex;
        const isSelected = commandIndex === selectedIndex;
        const nameStr = `/${cmd.name}`;
        const paddedName = nameStr.length < 20
          ? nameStr.padEnd(20, " ")
          : `${nameStr} `;

        return (
          <box key={cmd.name} paddingLeft={0}>
            <text
              fg={isSelected ? theme.colors.highlightSelected : theme.colors.border}
              attributes={textAttrs({ bold: isSelected })}
            >
              {paddedName}{cmd.description}
            </text>
          </box>
        );
      })}
      {hasHiddenAfter ? (
        <text fg={theme.colors.muted}>
          {`... ${cmds.length - startIndex - visibleCount} more below`}
        </text>
      ) : null}
    </box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
