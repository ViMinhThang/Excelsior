"use client";

import { useEffect } from "react";

type ShortcutHandler = (event: KeyboardEvent) => void;
type ShortcutMap = Record<string, ShortcutHandler>;

function matches(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop()!;
  const needsMeta = parts.includes("meta") || parts.includes("cmd");
  const needsCtrl = parts.includes("ctrl");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  const modOk =
    (needsMeta ? event.metaKey : true) &&
    (needsCtrl ? event.ctrlKey : true) &&
    (!needsCtrl && !needsMeta ? !event.ctrlKey && !event.metaKey : true);

  // Allow Cmd or Ctrl interchangeably when combo uses `mod`
  const modWildcard = combo.includes("mod");
  const metaOrCtrl = event.metaKey || event.ctrlKey;

  return (
    event.key.toLowerCase() === key &&
    (modWildcard ? metaOrCtrl : modOk) &&
    event.shiftKey === needsShift &&
    event.altKey === needsAlt
  );
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const [combo, fn] of Object.entries(shortcuts)) {
        const normalized = combo.replace("mod+", "mod+").toLowerCase();
        // support `mod+b`, `ctrl+b`, `meta+b`, `ctrl+,`, etc.
        const wantMod = normalized.startsWith("mod+");
        if (wantMod) {
          const k = normalized.slice(4);
          const pressed = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === k;
          // handle comma specially (key is ",")
          const pressedComma = k === "," ? (e.ctrlKey || e.metaKey) && e.key === "," : false;
          if (pressed || pressedComma) {
            e.preventDefault();
            fn(e);
            return;
          }
        } else if (matches(e, combo)) {
          e.preventDefault();
          fn(e);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
