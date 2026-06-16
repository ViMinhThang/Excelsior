import type { ReactNode } from "react";
import { truncateVisible } from "../textFormat.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";

export interface TextRun {
  text: string;
  inverse?: boolean;
  dim?: boolean;
  selected?: boolean;
}

export function buildInputRuns(
  value: string,
  displayCursorOffset: number,
  selectionRange: { start: number; end: number } | null,
  placeholder: string,
  focus: boolean,
  showCursor: boolean,
  maxDisplayWidth: number,
): TextRun[] {
  if (value.length === 0) {
    if (placeholder) {
      const truncated = truncateVisible(placeholder, maxDisplayWidth);
      if (focus && showCursor && truncated.length > 0) {
        return [
          { text: truncated[0], inverse: true, dim: true },
          { text: truncated.slice(1), dim: true },
        ];
      }
      return [{ text: truncated, dim: true }];
    }

    if (focus && showCursor) {
      return [{ text: " ", inverse: true }];
    }

    return [{ text: "" }];
  }

  if (!focus || !showCursor) {
    return [{ text: value }];
  }

  const runs: TextRun[] = [];
  let buffer = "";
  let bufferInverse = false;
  let bufferSelected = false;

  const flush = () => {
    if (!buffer) return;
    runs.push({
      text: buffer,
      inverse: bufferInverse,
      dim: false,
      selected: bufferSelected,
    });
    buffer = "";
  };

  for (let i = 0; i < value.length; i++) {
    const inverse = i === displayCursorOffset;
    const selected = Boolean(
      selectionRange && i >= selectionRange.start && i < selectionRange.end,
    );

    if (buffer && (inverse !== bufferInverse || selected !== bufferSelected)) {
      flush();
    }

    bufferInverse = inverse;
    bufferSelected = selected;
    buffer += value[i];
  }
  flush();

  if (displayCursorOffset === value.length) {
    runs.push({ text: " ", inverse: true });
  }

  return runs;
}

export function renderRuns(runs: TextRun[]): ReactNode {
  return (
    <box flexDirection="row">
      {runs.map((run, index) => (
        <text
          key={`input_run_${index}`}
          fg={
            run.selected
              ? theme.colors.highlight
              : run.dim
                ? theme.colors.muted
                : theme.colors.text
          }
          bg={run.selected ? theme.colors.modeHintKeyBg : undefined}
          attributes={textAttrs({
            inverse: run.inverse,
            dim: run.dim && !run.inverse && !run.selected,
          })}
        >
          {run.text}
        </text>
      ))}
    </box>
  );
}
