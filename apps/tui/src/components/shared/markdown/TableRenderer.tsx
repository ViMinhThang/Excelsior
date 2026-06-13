import type { FC } from "react";
import { type StyleProps, styleAttrs } from "./styles.js";
import { theme } from "../../../theme.js";

export function isTableBorderChar(char: string): boolean {
  return /^[\u2500-\u257f]$/.test(char);
}

export interface TableLineProps extends StyleProps {
  line: string;
  id: string;
}

export const TableLine: FC<TableLineProps> = ({ line, id, dimColor, italic, textColor }) => {
  const segments: Array<{ text: string; isBorder: boolean }> = [];

  for (const char of line) {
    const isBorder = isTableBorderChar(char);
    const last = segments.at(-1);
    if (last && last.isBorder === isBorder) {
      last.text += char;
    } else {
      segments.push({ text: char, isBorder });
    }
  }

  const attrs = styleAttrs(dimColor, italic);

  return (
    <text>
      {segments.map((segment, index) => (
        <span
          key={`table_segment_${id}_${index}`}
          fg={segment.isBorder ? theme.colors.border : textColor}
          attributes={attrs}
        >
          {segment.text}
        </span>
      ))}
    </text>
  );
};
