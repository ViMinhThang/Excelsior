import { useInput } from "ink";
import { useEffect, useRef } from "react";
import { keymapRegistry, RegisteredMap, KeyMap } from "../lib/keymapRegistry.js";
import { parseKeyCombo } from "../lib/parseKeyCombo.js";

export function useKeymap(
  map: KeyMap,
  options: { enabled?: boolean; priority?: number } = {},
) {
  const { enabled = true, priority = 0 } = options;

  const mapRef = useRef(map);
  mapRef.current = map;

  const entryRef = useRef<RegisteredMap>({
    id: Symbol("keymap"),
    priority,
    enabled,
    timestamp: Date.now(),
    getMap: () => mapRef.current,
  });

  entryRef.current.priority = priority;
  entryRef.current.enabled = enabled;

  useEffect(() => {
    if (enabled) {
      entryRef.current.timestamp = Date.now();
    }
  }, [enabled]);

  useEffect(() => {
    return keymapRegistry.register(entryRef.current);
  }, []);

  useInput((input, key) => {
    if (!entryRef.current.enabled) return;

    const combo = parseKeyCombo(input, key);
    const currentMap = mapRef.current;

    if (!currentMap[combo]) return;

    const winner = keymapRegistry.findWinner(combo);

    if (winner && winner.id === entryRef.current.id) {
      currentMap[combo]();
    }
  });
}
