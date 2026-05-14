import React, { useEffect, useState } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

interface SafeTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  showCursor?: boolean;
}

export function shouldIgnoreTextInputKey(input: string, key: any): boolean {
  return (
    key.upArrow ||
    key.downArrow ||
    key.tab ||
    (key.shift && key.tab) ||
    ((key.ctrl || key.meta) && input.length > 0)
  );
}

const SafeTextInput: React.FC<SafeTextInputProps> = ({
  value: originalValue,
  onChange,
  onSubmit,
  placeholder = "",
  focus = true,
  mask,
  showCursor = true,
}) => {
  const [state, setState] = useState({
    cursorOffset: (originalValue || "").length,
    cursorWidth: 0,
  });

  const { cursorOffset, cursorWidth } = state;

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
  const value = mask ? mask.repeat(originalValue.length) : originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");
    renderedValue = value.length > 0 ? "" : chalk.inverse(" ");

    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }

    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(" ");
    }
  }

  useInput((input, key) => {
    if (shouldIgnoreTextInputKey(input, key)) return;

    if (key.return) {
      onSubmit?.(originalValue);
      return;
    }

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

    if (cursorOffset < 0) nextCursorOffset = 0;
    if (cursorOffset > originalValue.length) nextCursorOffset = originalValue.length;

    setState({
      cursorOffset: nextCursorOffset,
      cursorWidth: nextCursorWidth,
    });

    if (nextValue !== originalValue) {
      onChange(nextValue);
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
