import { truncateVisible } from "../textFormat.js";
import type { TuiKey } from "../tuiKey.js";

export function isCopyShortcut(input: string, key: TuiKey): boolean {
  return Boolean(key.ctrl && key.shift && input.toLowerCase() === "c");
}

export function isPasteShortcut(input: string, key: TuiKey): boolean {
  return Boolean((key.ctrl || key.meta) && input.toLowerCase() === "v");
}

export function isSelectAllShortcut(input: string, key: TuiKey): boolean {
  return Boolean((key.ctrl || key.meta) && input.toLowerCase() === "a");
}

export function isClipboardShortcut(
  input: string,
  key: TuiKey,
  options: { selectAll?: boolean } = {},
): boolean {
  return isCopyShortcut(input, key)
    || isPasteShortcut(input, key)
    || Boolean(options.selectAll && isSelectAllShortcut(input, key));
}

export function sanitizeSingleLinePaste(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n").join(" ").replace(/\s+/g, " ").trim();
}

export function getSelectionRange(
  cursorOffset: number,
  selectionAnchor: number | null,
): { start: number; end: number } | null {
  if (selectionAnchor === null || selectionAnchor === cursorOffset) return null;
  return {
    start: Math.min(cursorOffset, selectionAnchor),
    end: Math.max(cursorOffset, selectionAnchor),
  };
}

export function getCopyText(
  value: string,
  cursorOffset: number,
  selectionAnchor: number | null,
): string {
  const range = getSelectionRange(cursorOffset, selectionAnchor);
  if (!range) return value;
  return value.slice(range.start, range.end);
}

export function insertTextAtCursor(
  value: string,
  cursorOffset: number,
  selectionAnchor: number | null,
  text: string,
): { value: string; cursorOffset: number; selectionAnchor: null } {
  const range = getSelectionRange(cursorOffset, selectionAnchor);
  const start = range?.start ?? cursorOffset;
  const end = range?.end ?? cursorOffset;
  const nextValue = value.slice(0, start) + text + value.slice(end);
  const nextCursorOffset = start + text.length;

  return {
    value: nextValue,
    cursorOffset: nextCursorOffset,
    selectionAnchor: null,
  };
}

export function shouldIgnoreTextInputKey(input: string, key: TuiKey): boolean {
  return Boolean(
    key.upArrow ||
    key.downArrow ||
    key.tab ||
    (key.shift && key.tab) ||
    ((key.ctrl || key.meta) && input.length > 0),
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
  selectionAnchor: number | null,
  input: string,
  key: TuiKey,
  showCursor: boolean,
): {
  value: string;
  cursorOffset: number;
  selectionAnchor: number | null;
  cursorWidth: number;
} {
  let nextCursorOffset = cursorOffset;
  let nextSelectionAnchor = selectionAnchor;
  let nextValue = originalValue;
  let nextCursorWidth = 0;

  if (key.leftArrow || key.rightArrow) {
    if (!showCursor) {
      return {
        value: nextValue,
        cursorOffset: clampCursorOffset(nextValue, nextCursorOffset),
        selectionAnchor: nextSelectionAnchor,
        cursorWidth: nextCursorWidth,
      };
    }

    if (!key.shift) {
      nextSelectionAnchor = null;
    } else if (nextSelectionAnchor === null) {
      nextSelectionAnchor = cursorOffset;
    }

    nextCursorOffset += key.leftArrow ? -1 : 1;
  } else if (key.backspace || key.delete) {
    if (selectionAnchor !== null && selectionAnchor !== cursorOffset) {
      const rangeStart = Math.min(cursorOffset, selectionAnchor);
      const rangeEnd = Math.max(cursorOffset, selectionAnchor);
      nextValue =
        originalValue.slice(0, rangeStart) +
        originalValue.slice(rangeEnd, originalValue.length);
      nextCursorOffset = rangeStart;
      nextSelectionAnchor = null;
    } else if (key.backspace && cursorOffset > 0) {
      nextValue =
        originalValue.slice(0, cursorOffset - 1) +
        originalValue.slice(cursorOffset, originalValue.length);
      nextCursorOffset--;
      nextSelectionAnchor = null;
    } else if (key.delete && cursorOffset < originalValue.length) {
      nextValue =
        originalValue.slice(0, cursorOffset) +
        originalValue.slice(cursorOffset + 1, originalValue.length);
      nextSelectionAnchor = null;
    }
  } else {
    const rangeStart = selectionAnchor === null
      ? cursorOffset
      : Math.min(cursorOffset, selectionAnchor);
    const rangeEnd = selectionAnchor === null
      ? cursorOffset
      : Math.max(cursorOffset, selectionAnchor);

    nextValue =
      originalValue.slice(0, rangeStart) +
      input +
      originalValue.slice(rangeEnd, originalValue.length);
    nextCursorOffset = rangeStart + input.length;
    nextSelectionAnchor = null;
    if (input.length > 1) nextCursorWidth = input.length;
  }

  return {
    value: nextValue,
    cursorOffset: clampCursorOffset(nextValue, nextCursorOffset),
    selectionAnchor: nextSelectionAnchor === null
      ? null
      : clampCursorOffset(nextValue, nextSelectionAnchor),
    cursorWidth: nextCursorWidth,
  };
}
