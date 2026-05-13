import { useInput } from "ink";
import { useEffect, useRef } from "react";

export type KeyAction = () => void;
export type KeyMap = Record<string, KeyAction>;

interface RegisteredMap {
  id: symbol;
  priority: number;
  enabled: boolean;
  timestamp: number;
  getMap: () => KeyMap;
}

class KeymapRegistry {
  private maps: RegisteredMap[] = [];

  register(entry: RegisteredMap): () => void {
    this.maps.push(entry);
    return () => {
      const index = this.maps.indexOf(entry);
      if (index !== -1) this.maps.splice(index, 1);
    };
  }

  findWinner(combo: string): RegisteredMap | undefined {
    const sorted = [...this.maps].sort((a, b) => {
      return b.priority - a.priority || b.timestamp - a.timestamp;
    });
    return sorted.find((reg) => reg.enabled && reg.getMap()[combo]);
  }

  dispose(): void {
    this.maps = [];
  }
}

const keymapRegistry = new KeymapRegistry();

/**
 * Translates Ink's input structure into a normalized string representation.
 * Supports stacked concurrent modifiers (e.g., "ctrl+shift+up").
 */
export function parseKeyCombo(input: string, key: any): string {
  const combo: string[] = [];

  if (key.ctrl) combo.push("ctrl");
  if (key.meta) combo.push("meta");

  const isLoneLetter =
    input && /^[a-zA-Z]$/.test(input) && !key.ctrl && !key.meta;
  if (key.shift && !isLoneLetter) {
    combo.push("shift");
  }

  if (key.upArrow) combo.push("up");
  else if (key.downArrow) combo.push("down");
  else if (key.leftArrow) combo.push("left");
  else if (key.rightArrow) combo.push("right");
  else if (key.return) combo.push("return");
  else if (key.escape) combo.push("escape");
  else if (key.tab) combo.push("tab");
  else if (key.backspace) combo.push("backspace");
  else if (key.delete) combo.push("delete");
  else if (key.pageUp) combo.push("pageup");
  else if (key.pageDown) combo.push("pagedown");
  else if (input) combo.push(input.toLowerCase());

  return combo.join("+");
}

/**
 * High-level declarative hook to bind shortcuts to functions.
 * Safely registers to a prioritized central stack to guarantee explicit execution order.
 */
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
