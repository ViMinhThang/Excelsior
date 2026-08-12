import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../src/store/store.js";
import { createInitialState } from "../../src/store/types.js";

function makeState() {
  return createInitialState({
    id: "w",
    name: "w",
    rootPath: "C:\\workspace",
  });
}

describe("store", () => {
  it("holds the initial state", () => {
    const store = createStore(makeState());
    expect(store.getState().ui.focus).toBe("input");
    expect(store.getState().ui.screen).toBe("chat");
    expect(store.getState().overlay.kind).toBe("none");
  });

  it("applies updates immutably", () => {
    const store = createStore(makeState());
    const before = store.getState();
    store.dispatch((s) => ({ ui: { ...s.ui, screen: "settings" } }));
    const after = store.getState();
    expect(after.ui.screen).toBe("settings");
    expect(before.ui.screen).toBe("chat");
    expect(before.ui).not.toBe(after.ui);
  });

  it("notifies subscribers on dispatch", () => {
    const store = createStore(makeState());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch((s) => ({ ui: { ...s.ui, screen: "settings" } }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the reducer returns void", () => {
    const store = createStore(makeState());
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  it("seeds a fresh input and empty transcript", () => {
    const store = createStore(makeState());
    const state = store.getState();
    expect(state.ui.input).toEqual({ value: "", cursor: 0, history: [], historyIndex: -1 });
    expect(state.transcript.blocks).toEqual([]);
    expect(state.transcript.live).toBeNull();
  });
});
