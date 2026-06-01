import { describe, expect, it } from "vitest";
import { ProjectionRegistry } from "../src/projection/readModel.js";

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

    let state = model.apply(model.initialState(), {
      type: "increment",
      payload: { amount: 5 },
    });
    expect(state.count).toBe(5);

    state = model.apply(state, { type: "unknown" });
    expect(state.count).toBe(5);

    state = model.apply(state, { type: "reset" });
    expect(state.count).toBe(0);
  });

  it("throws during build if initial state is not defined", () => {
    const registry = new ProjectionRegistry<TestState, TestEvent>();

    expect(() => registry.build()).toThrow(
      "Initial state function must be defined on ProjectionRegistry",
    );
  });
});
