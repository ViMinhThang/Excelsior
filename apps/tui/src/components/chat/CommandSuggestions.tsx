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

  return (
    <box marginTop={1} flexDirection="column">
      {cmds.slice(0, maxVisibleCount).map((cmd, index) => {
        const isSelected = index === selectedIndex;
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
    </box>
  );
}

export const CommandSuggestions = memo(CommandSuggestionsInner);
