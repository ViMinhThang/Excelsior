import { describe, expect, it, vi } from "vitest";
import { ProjectionRegistry, projectEvents, compose, accumulate, assign } from "../src/index.js";

interface TestState {
  count: number;
  sequence: string[];
}

type TestEvent =
  | { type: "increment"; payload?: { amount?: number } }
  | { type: "reset" }
  | { type: "unknown" };

describe("ProjectionRegistry", () => {
  it("uses initial state and applies registered event reducers", () => {
    const registry = new ProjectionRegistry<TestState, TestEvent>()
      .initialState(() => ({ count: 0, sequence: [] }))
      .on("increment", (state, event) => ({
        ...state,
        count: state.count + (event.payload?.amount ?? 1),
      }))
      .on("reset", (state) => ({
        ...state,
        count: 0,
      }));

    const model = registry.build();

    expect(model.initialState()).toEqual({ count: 0, sequence: [] });

    // Test increment
    let state = model.apply(model.initialState(), { type: "increment", payload: { amount: 5 } });
    expect(state.count).toBe(5);

    // Test unhandled event returns state unmodified
    state = model.apply(state, { type: "unknown" });
    expect(state.count).toBe(5);

    // Test reset
    state = model.apply(state, { type: "reset" });
    expect(state.count).toBe(0);
  });

  it("throws during build if initial state is not defined", () => {
    const registry = new ProjectionRegistry<TestState, TestEvent>();
    expect(() => registry.build()).toThrow("Initial state function must be defined on ProjectionRegistry");
  });

  it("executes middleware in registration order", () => {
    const registry = new ProjectionRegistry<TestState, TestEvent>()
      .initialState(() => ({ count: 0, sequence: [] }))
      .use((state, _event, _context, next) => {
        const nextState = next(state);
        return {
          ...nextState,
          sequence: [...nextState.sequence, "mw1"],
        };
      })
      .use((state, _event, _context, next) => {
        const nextState = next(state);
        return {
          ...nextState,
          sequence: [...nextState.sequence, "mw2"],
        };
      })
      .on("increment", (state) => ({
        ...state,
        count: state.count + 1,
        sequence: [...state.sequence, "reducer"],
      }));

    const model = registry.build();
    const state = projectEvents(model, [{ type: "increment" }]);

    expect(state.count).toBe(1);
    // Since we call `next` first in the middleware and append to sequence on the return path:
    // Reducer runs first -> then mw2 returns -> then mw1 returns.
    expect(state.sequence).toEqual(["reducer", "mw2", "mw1"]);
  });

  it("allows middleware to short-circuit or modify state pre-reduction", () => {
    const reducerFn = vi.fn((state) => state);

    const registry = new ProjectionRegistry<TestState, TestEvent>()
      .initialState(() => ({ count: 0, sequence: [] }))
      .use((state, _event, _context, next) => {
        // Intercept and increment before passing downstream
        return next({ ...state, count: state.count + 10 });
      })
      .use((state, _event, _context) => {
        // Short-circuit: do not call `next`
        return { ...state, sequence: ["short-circuited"] };
      })
      .on("increment", reducerFn);

    const model = registry.build();
    const state = model.apply(model.initialState(), { type: "increment" });

    expect(state.count).toBe(10); // Incremented by mw1
    expect(state.sequence).toEqual(["short-circuited"]); // Set by short-circuiting mw2
    expect(reducerFn).not.toHaveBeenCalled(); // Reducer was skipped
  });
});

describe("composable mutators", () => {
  interface DummyState {
    count: number;
    log: string[];
  }

  it("compose runs mutators in left-to-right order", () => {
    const fn1 = (s: DummyState) => ({ ...s, count: s.count + 1 });
    const fn2 = (s: DummyState) => ({ ...s, log: [...s.log, `count is ${s.count}`] });
    const composed = compose<DummyState, any>(fn1, fn2);

    const state = composed({ count: 0, log: [] }, { type: "test" });
    expect(state).toEqual({
      count: 1,
      log: ["count is 1"],
    });
  });

  it("accumulate merges partial state updates dynamically", () => {
    const mutator = accumulate<DummyState, { type: string; payload: number }>(
      (state, event) => ({ count: state.count + event.payload }),
    );

    const state = mutator({ count: 5, log: [] }, { type: "test", payload: 10 });
    expect(state).toEqual({
      count: 15,
      log: [],
    });
  });

  it("assign updates a single key in the state", () => {
    const mutator = assign<DummyState, "count", { type: string; val: number }>(
      "count",
      (state, event) => state.count * event.val,
    );

    const state = mutator({ count: 4, log: ["ok"] }, { type: "test", val: 3 });
    expect(state).toEqual({
      count: 12,
      log: ["ok"],
    });
  });
});
