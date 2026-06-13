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
import { buildInputRuns, renderRuns } from "../../lib/input/textInputRuns.js";

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