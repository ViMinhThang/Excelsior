import { describe, expect, it, vi } from "vitest";
import {
  DiffEmitter,
  DIFF_RING_BUFFER_CAPACITY,
} from "@excelsior/engine";

const sessionScope = { kind: "session", sessionId: "s1" } as const;
const metaScope = { kind: "meta" } as const;

describe("DiffEmitter", () => {
  it("emits deltas to subscribers with stamped revisions", () => {
    const emitter = new DiffEmitter();
    const received = vi.fn();
    emitter.subscribe(received);

    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });

    expect(received).toHaveBeenCalledTimes(2);
    expect(received.mock.calls[0][0].rev).toBe(1);
    expect(received.mock.calls[1][0].rev).toBe(2);
  });

  it("keeps revisions monotonic and independent per scope", () => {
    const emitter = new DiffEmitter();
    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    emitter.emit(metaScope, { scope: metaScope, delta: { kind: "meta-changed" } });
    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });

    expect(emitter.lastRev(sessionScope)).toBe(2);
    expect(emitter.lastRev(metaScope)).toBe(1);
    expect(emitter.lastRev({ kind: "run", sessionId: "s1" })).toBe(0);
  });

  it("deltasSince returns only deltas after the cursor", () => {
    const emitter = new DiffEmitter();
    for (let i = 0; i < 3; i += 1) {
      emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    }
    expect(emitter.deltasSince(sessionScope, 1)!.map((d) => d.rev)).toEqual([2, 3]);
    expect(emitter.deltasSince(sessionScope, 3)).toEqual([]);
  });

  it("deltasSince returns null when the cursor fell out of the ring buffer", () => {
    const emitter = new DiffEmitter();
    for (let i = 0; i < DIFF_RING_BUFFER_CAPACITY + 5; i += 1) {
      emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    }
    expect(emitter.lastRev(sessionScope)).toBe(DIFF_RING_BUFFER_CAPACITY + 5);
    expect(emitter.deltasSince(sessionScope, 0)).toBeNull();
    expect(emitter.deltasSince(sessionScope, DIFF_RING_BUFFER_CAPACITY)).not.toBeNull();
  });

  it("returns [] for an untouched scope when the cursor is at 0", () => {
    const emitter = new DiffEmitter();
    expect(emitter.deltasSince(sessionScope, 0)).toEqual([]);
  });

  it("isolates failing subscribers", () => {
    const emitter = new DiffEmitter();
    const broken = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    emitter.subscribe(broken);
    emitter.subscribe(healthy);

    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = new DiffEmitter();
    const received = vi.fn();
    const unsubscribe = emitter.subscribe(received);
    unsubscribe();
    emitter.emit(sessionScope, { scope: sessionScope, delta: { kind: "meta-changed" } });
    expect(received).not.toHaveBeenCalled();
  });
});
