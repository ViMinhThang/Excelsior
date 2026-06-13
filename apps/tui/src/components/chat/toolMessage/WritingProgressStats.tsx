import { type FC } from "react";
import { textAttrs } from "../../../platform/opentui/textAttributes.js";
import { theme } from "../../../theme.js";

export interface WritingProgressStatsProps {
  added: number;
  removed: number;
}

export const WritingProgressStats: FC<WritingProgressStatsProps> = ({
  added,
  removed,
}) => (
  <box flexDirection="row" gap={1} paddingLeft={2}>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      {theme.glyphs.branch}
    </text>
    <text fg={theme.colors.diffAddedText}>+{added}</text>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      lines
    </text>
    <text fg={theme.colors.diffRemovedText}>-{removed}</text>
    <text fg={theme.colors.muted} attributes={textAttrs({ dim: true })}>
      lines
    </text>
  </box>
);
