import { useInput } from "ink";
import { useEffect, useRef } from "react";
import {
  register,
  getAction,
  type KeyMap,
  type KeymapEntry,
} from "../lib/keymapRegistry.js";
import { parseKeyCombo } from "../lib/parseKeyCombo.js";

export function useKeymap(
  map: KeyMap,
  options: { enabled?: boolean; priority?: number } = {},
) {
  const { enabled = true, priority = 0 } = options;

  const mapRef = useRef(map);
  mapRef.current = map;

  const entryRef = useRef<KeymapEntry>({
    priority,
    enabled,
    getMap: () => mapRef.current,
  });

  // Keep mutable fields in sync with latest render
  entryRef.current.priority = priority;
  entryRef.current.enabled = enabled;

  useEffect(() => {
    return register(entryRef.current);
  }, []);

  useInput((input, key) => {
    const combo = parseKeyCombo(input, key);
    const winner = getAction(combo);
    if (winner && winner.entry === entryRef.current) {
      winner.action();
    }
  });
}
