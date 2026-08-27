import type { AgentDelta, DeltaScope, WireDelta } from "@excelsior/protocol";

export const DIFF_RING_BUFFER_CAPACITY = 1000;

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

export type UnstampedDelta = DistributiveOmit<AgentDelta, "rev">;

export function scopeKey(scope: DeltaScope): string {
  return scope.kind === "meta" ? "meta" : `${scope.kind}:${scope.sessionId}`;
}

export function emitMetaError(emitter: DiffEmitter, message: string): void {
  emitter.emit(
    { kind: "meta" },
    { scope: { kind: "meta" }, delta: { kind: "error", message } },
  );
}

interface ScopeRing {
  deltas: WireDelta[];
  lastRev: number;
}

export class DiffEmitter {
  private readonly rings = new Map<string, ScopeRing>();
  private readonly listeners = new Set<(delta: WireDelta) => void>();

  subscribe(listener: (delta: WireDelta) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  lastRev(scope: DeltaScope): number {
    return this.rings.get(scopeKey(scope))?.lastRev ?? 0;
  }

  emit(scope: DeltaScope, delta: UnstampedDelta): void {
    const key = scopeKey(scope);
    const ring = this.rings.get(key) ?? { deltas: [], lastRev: 0 };
    ring.lastRev += 1;
    const stamped = { ...delta, rev: ring.lastRev } as WireDelta;
    ring.deltas.push(stamped);
    if (ring.deltas.length > DIFF_RING_BUFFER_CAPACITY) {
      ring.deltas.shift();
    }
    this.rings.set(key, ring);
    for (const listener of [...this.listeners]) {
      try {
        listener(stamped);
      } catch {
        // a failing subscriber must not break the emitter or other subscribers
      }
    }
  }

  deltasSince(scope: DeltaScope, cursor: number): WireDelta[] | null {
    const ring = this.rings.get(scopeKey(scope));
    if (!ring) return cursor <= 0 ? [] : null;
    if (cursor < ring.deltas[0].rev - 1) return null;
    return ring.deltas.filter((delta) => delta.rev > cursor);
  }
}
