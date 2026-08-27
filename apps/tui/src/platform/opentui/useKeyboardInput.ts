import { useKeyboard } from "@opentui/react";
import { useRef } from "react";
import type { KeyEvent } from "@opentui/core";
import type { TuiKey } from "../../routing/keys.js";
import { keyEventToTuiKey } from "./keyAdapter.js";

type InputHandler = (input: string, key: TuiKey, event: KeyEvent) => void;

export function useKeyboardInput(handler: InputHandler, options: { isActive?: boolean } = {}): void {
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
