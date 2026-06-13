import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { useRef } from "react";
import { keyEventToTuiKey } from "./keyAdapter.js";
import type { TuiKey } from "../../lib/tuiKey.js";

type InputHandler = (input: string, key: TuiKey, event: KeyEvent) => void;

export function useKeyboardInput(
  handler: InputHandler,
  options: { isActive?: boolean } = {},
) {
  const { isActive = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useKeyboard((key) => {
    if (!isActive) return;
    if (key.eventType === "release") return;
    const mapped = keyEventToTuiKey(key);
    handlerRef.current(mapped.input, mapped.key, key);
  });
}
