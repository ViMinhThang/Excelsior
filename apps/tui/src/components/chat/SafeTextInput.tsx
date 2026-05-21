import { useEffect, useState, type FC } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";
import { truncateVisible } from "../../lib/textFormat.js";
import type { TuiKey } from "../../lib/tuiKey.js";

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

export function shouldIgnoreTextInputKey(input: string, key: TuiKey): boolean {
  return Boolean(
    key.upArrow ||
    key.downArrow ||
    key.tab ||
    (key.shift && key.tab) ||
    ((key.ctrl || key.meta) && input.length > 0)
  );
}

export function getSingleLineInputPreview(
  value: string,
  cursorOffset: number,
  maxDisplayWidth: number,
): { text: string; cursorOffset: number } {
  const beforeCursor = value.slice(0, cursorOffset);
  const lineStart = beforeCursor.lastIndexOf("\n") + 1;
  const lineEnd = value.indexOf("\n", cursorOffset);
  const rawLine = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd).replace(/\r/g, "");
  const rawCursorOffset = Math.max(0, cursorOffset - lineStart);
  const text = truncateVisible(rawLine, maxDisplayWidth);

  return {
    text,
    cursorOffset: Math.min(rawCursorOffset, text.length),
  };
}

export function clampCursorOffset(value: string, cursorOffset: number): number {
  return Math.max(0, Math.min(cursorOffset, value.length));
}

export function applyTextInputKey(
  originalValue: string,
  cursorOffset: number,
  input: string,
  key: TuiKey,
  showCursor: boolean,
): { value: string; cursorOffset: number; cursorWidth: number } {
  let nextCursorOffset = cursorOffset;
  let nextValue = originalValue;
  let nextCursorWidth = 0;

  if (key.leftArrow) {
    if (showCursor) nextCursorOffset--;
  } else if (key.rightArrow) {
    if (showCursor) nextCursorOffset++;
  } else if (key.backspace || key.delete) {
    if (cursorOffset > 0) {
      nextValue =
        originalValue.slice(0, cursorOffset - 1) +
        originalValue.slice(cursorOffset, originalValue.length);
      nextCursorOffset--;
    }
  } else {
    nextValue =
      originalValue.slice(0, cursorOffset) +
      input +
      originalValue.slice(cursorOffset, originalValue.length);
    nextCursorOffset += input.length;
    if (input.length > 1) nextCursorWidth = input.length;
  }

  return {
    value: nextValue,
    cursorOffset: clampCursorOffset(nextValue, nextCursorOffset),
    cursorWidth: nextCursorWidth,
  };
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
  const [state, setState] = useState({
    cursorOffset: (originalValue || "").length,
    cursorWidth: 0,
  });

  const { cursorOffset } = state;

  useEffect(() => {
    setState((previousState) => {
      if (!focus || !showCursor) return previousState;

      const newValue = originalValue || "";
      if (previousState.cursorOffset > newValue.length - 1) {
        return {
          cursorOffset: newValue.length,
          cursorWidth: 0,
        };
      }

      return previousState;
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = 0;
  const rawDisplayValue = mask ? mask.repeat(originalValue.length) : originalValue;
  const preview = getSingleLineInputPreview(rawDisplayValue, cursorOffset, maxDisplayWidth);
  const value = preview.text;
  const displayCursorOffset = preview.cursorOffset;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(truncateVisible(placeholder, maxDisplayWidth)) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");
    renderedValue = value.length > 0 ? "" : chalk.inverse(" ");

    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= displayCursorOffset - cursorActualWidth && i <= displayCursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }

    if (value.length > 0 && displayCursorOffset === value.length) {
      renderedValue += chalk.inverse(" ");
    }
  }

  useInput((input, key) => {
    if (shouldIgnoreTextInputKey(input, key)) return;

    if (key.return) {
      if (shouldSubmit && !shouldSubmit(originalValue)) return;
      onSubmit?.(originalValue);
      return;
    }

    const next = applyTextInputKey(
      originalValue,
      cursorOffset,
      input,
      key,
      showCursor,
    );

    setState({
      cursorOffset: next.cursorOffset,
      cursorWidth: next.cursorWidth,
    });

    if (next.value !== originalValue) {
      onChange(next.value);
    }
  }, { isActive: focus });

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
};

export default SafeTextInput;
