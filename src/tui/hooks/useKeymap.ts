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

/** Shared central pool allowing hooks to determine resolving precedence live */
const activeMaps: RegisteredMap[] = [];

/**
 * Translates Ink's input structure into a normalized string representation.
 * Supports stacked concurrent modifiers (e.g., "ctrl+shift+up").
 */
export function parseKeyCombo(input: string, key: any): string {
  const combo: string[] = [];

  // Modifiers in consistent order
  if (key.ctrl) combo.push("ctrl");
  if (key.meta) combo.push("meta");

  const isLoneLetter =
    input && /^[a-zA-Z]$/.test(input) && !key.ctrl && !key.meta;
  if (key.shift && !isLoneLetter) {
    combo.push("shift");
  }

  // Specific named keys take precedence over raw input
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

  // 1. Stable Reference Storage: allows calling with object literals safely
  const mapRef = useRef(map);
  mapRef.current = map;

  // 2. Dynamic Entry Container: maintained internally and accessed by shared registry
  const entryRef = useRef<RegisteredMap>({
    id: Symbol("keymap"),
    priority,
    enabled,
    timestamp: Date.now(),
    getMap: () => mapRef.current,
  });

  // Keep runtime stats up-to-date for the sorted stack check
  entryRef.current.priority = priority;
  entryRef.current.enabled = enabled;

  // Track time stamps strictly upon enabling to break ties with fresh activations
  useEffect(() => {
    if (enabled) {
      entryRef.current.timestamp = Date.now();
    }
  }, [enabled]);

  // 3. Registration Lifespan
  useEffect(() => {
    const registration = entryRef.current;
    activeMaps.push(registration);

    return () => {
      const index = activeMaps.indexOf(registration);
      if (index !== -1) activeMaps.splice(index, 1);
    };
  }, []);

  // 4. The Unconditional Execution Hook
  useInput((input, key) => {
    // Pre-flight check: read through mutable pointer to fully evade closure capture side-effects
    if (!entryRef.current.enabled) return;

    const combo = parseKeyCombo(input, key);
    const currentMap = mapRef.current;

    // Optimistic check: does this local map actually define a rule for this combo?
    if (!currentMap[combo]) return;

    // Conflict Resolution Check:
    // Iterate through the entire sorted ecosystem to discover who commands the right to this combo
    const sorted = [...activeMaps].sort((a, b) => {
      // Sort Descending: 1st by specified Priority, 2nd by recent Activation Timestamp (LIFO tie-break)
      return b.priority - a.priority || b.timestamp - a.timestamp;
    });

    // Find the actual 'winning' hook controlling this specific key right now
    const winner = sorted.find((reg) => reg.enabled && reg.getMap()[combo]);

    // Final Gate: only execute if THIS hook instances' UNIQUE ID matches the definitive winner
    if (winner && winner.id === entryRef.current.id) {
      currentMap[combo]();
    }
  });
}
