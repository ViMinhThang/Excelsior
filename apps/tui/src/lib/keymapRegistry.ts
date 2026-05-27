export type KeyAction = () => void;
export type KeyMap = Partial<Record<string, KeyAction>>;

export interface KeymapEntry {
  priority: number;
  enabled: boolean;
  getMap: () => KeyMap;
}

const stack: KeymapEntry[] = [];

export function register(entry: KeymapEntry): () => void {
  stack.push(entry);
  return () => {
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
  };
}

export function resolveKeyAction(
  entries: KeymapEntry[],
  combo: string,
): { entry: KeymapEntry; action: KeyAction } | undefined {
  const sorted = [...entries].sort((a, b) => b.priority - a.priority);
  for (const entry of sorted) {
    if (entry.enabled) {
      const action = entry.getMap()[combo];
      if (action) return { entry, action };
    }
  }
  return undefined;
}

/** Find the highest-priority enabled entry that handles `combo`. */
export function getAction(
  combo: string,
): { entry: KeymapEntry; action: KeyAction } | undefined {
  return resolveKeyAction(stack, combo);
}

/** For tests only — clears all registered entries. */
export function resetStack(): void {
  stack.length = 0;
}
