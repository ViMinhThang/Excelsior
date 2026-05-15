export type KeyAction = () => void;
export type KeyMap = Record<string, KeyAction>;

export interface RegisteredMap {
  id: symbol;
  priority: number;
  enabled: boolean;
  timestamp: number;
  getMap: () => KeyMap;
}

export class KeymapRegistry {
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

export const keymapRegistry = new KeymapRegistry();
