import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { decodePasteBytes } from "@opentui/core";
import { usePaste, useRenderer } from "@opentui/react";
import { useKeyboardInput } from "../../platform/opentui/useKeyboardInput.js";
import { useKeymap } from "../../hooks/useKeymap.js";
import {
  applyTextInputKey,
  getCopyText,
  getSingleLineInputPreview,
  insertTextAtCursor,
  isClipboardShortcut,
  sanitizeSingleLinePaste,
  shouldIgnoreTextInputKey,
} from "../../lib/input/textInput.js";
import { copyTextToClipboard, readTextFromClipboard } from "../../platform/clipboard.js";
import { truncateVisible } from "../../lib/textFormat.js";
import { textAttrs } from "../../platform/opentui/textAttributes.js";
import { theme } from "../../theme.js";

interface SafeTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  showCursor?: boolean;
  maxDisplayWidth?: number;
  shouldSubmit?: (value: string) => boolean;
}

interface TextRun {
  text: string;
  inverse?: boolean;
  dim?: boolean;
  selected?: boolean;
}

function buildInputRuns(
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

function renderRuns(runs: TextRun[]): ReactNode {
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

const SafeTextInput: FC<SafeTextInputProps> = ({
  value: originalValue,
  onChange,
  onSubmit,
  placeholder = "",
  focus = true,
  mask,
  showCursor = true,
  maxDisplayWidth = 96,
  shouldSubmit,
}) => {
  const renderer = useRenderer();
  const [state, setState] = useState({
    cursorOffset: (originalValue || "").length,
    selectionAnchor: null as number | null,
    cursorWidth: 0,
  });

  const { cursorOffset, selectionAnchor } = state;

  useEffect(() => {
    setState((previousState) => {
      if (!focus || !showCursor) return previousState;

      const newValue = originalValue || "";
      if (previousState.cursorOffset > newValue.length - 1) {
        return {
          cursorOffset: newValue.length,
          selectionAnchor: null,
          cursorWidth: 0,
        };
      }

      return previousState;
    });
  }, [originalValue, focus, showCursor]);

  const applyPaste = useCallback((rawText: string) => {
    const text = sanitizeSingleLinePaste(rawText);
    if (!text) return;

    const next = insertTextAtCursor(
      originalValue,
      cursorOffset,
      selectionAnchor,
      text,
    );

    setState({
      cursorOffset: next.cursorOffset,
      selectionAnchor: null,
      cursorWidth: text.length,
    });

    if (next.value !== originalValue) {
      onChange(next.value);
    }
  }, [cursorOffset, onChange, originalValue, selectionAnchor]);

  const copySelection = useCallback(() => {
    copyTextToClipboard(
      getCopyText(originalValue, cursorOffset, selectionAnchor),
      renderer,
    );
  }, [cursorOffset, originalValue, renderer, selectionAnchor]);

  const pasteFromClipboard = useCallback(() => {
    void readTextFromClipboard().then(applyPaste);
  }, [applyPaste]);

  useKeymap(
    {
      "ctrl+c": copySelection,
      "ctrl+v": pasteFromClipboard,
      "meta+c": copySelection,
      "meta+v": pasteFromClipboard,
      "ctrl+a": () => {
        setState((previous) => ({
          ...previous,
          cursorOffset: originalValue.length,
          selectionAnchor: 0,
        }));
      },
      "meta+a": () => {
        setState((previous) => ({
          ...previous,
          cursorOffset: originalValue.length,
          selectionAnchor: 0,
        }));
      },
    },
    { enabled: focus, priority: 150 },
  );

  usePaste(useCallback((event) => {
    if (!focus) return;
    applyPaste(decodePasteBytes(event.bytes));
  }, [applyPaste, focus]));

  const rawDisplayValue = mask ? mask.repeat(originalValue.length) : originalValue;
  const preview = getSingleLineInputPreview(rawDisplayValue, cursorOffset, maxDisplayWidth);
  const runs = useMemo(
    () => buildInputRuns(
      preview.text,
      preview.cursorOffset,
      null,
      placeholder,
      focus,
      showCursor,
      maxDisplayWidth,
    ),
    [preview.text, preview.cursorOffset, placeholder, focus, showCursor, maxDisplayWidth],
  );

  useKeyboardInput((input, key) => {
    if (isClipboardShortcut(input, key, { selectAll: true })) {
      return;
    }

    if (shouldIgnoreTextInputKey(input, key)) return;

    if (key.return) {
      if (shouldSubmit && !shouldSubmit(originalValue)) return;
      onSubmit?.(originalValue);
      return;
    }

    const next = applyTextInputKey(
      originalValue,
      cursorOffset,
      selectionAnchor,
      input,
      key,
      showCursor,
    );

    setState({
      cursorOffset: next.cursorOffset,
      selectionAnchor: next.selectionAnchor,
      cursorWidth: next.cursorWidth,
    });

    if (next.value !== originalValue) {
      onChange(next.value);
    }
  }, { isActive: focus });

  return renderRuns(runs);
};

export default SafeTextInput;