import { describe, expect, it, vi } from "vitest";
import { ProjectionRegistry, projectEvents } from "../src/index.js";

interface TestState {
  count: number;
  sequence: string[];
}

interface TestEvent {
  type: string;
  payload?: any;
}

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
      .use((state, event, context, next) => {
        const nextState = next(state);
        return {
          ...nextState,
          sequence: [...nextState.sequence, "mw1"],
        };
      })
      .use((state, event, context, next) => {
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
      .use((state, event, context, next) => {
        // Intercept and increment before passing downstream
        return next({ ...state, count: state.count + 10 });
      })
      .use((state, event, context, next) => {
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
