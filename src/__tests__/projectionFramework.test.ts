import { describe, expect, it } from "vitest";
import { defineReadModel, projectEvents, type ReadModel } from "@excelsior/projection";

type CounterEvent =
  | { type: "add"; value: number }
  | { type: "multiply"; value: number };

describe("@excelsior/projection", () => {
  it("returns the initial state for an empty event list", () => {
    const model = defineReadModel<number, CounterEvent>({
      initialState: () => 10,
      apply: (state) => state + 1,
    });

    expect(projectEvents(model, [])).toBe(10);
  });

  it("applies events in order", () => {
    const model = defineReadModel<number, CounterEvent>({
      initialState: () => 1,
      apply(state, event) {
        if (event.type === "add") return state + event.value;
        return state * event.value;
      },
    });

    expect(projectEvents(model, [
      { type: "add", value: 2 },
      { type: "multiply", value: 4 },
    ])).toBe(12);
  });

  it("passes context to each apply call", () => {
    const seen: string[] = [];
    const model = defineReadModel<number, CounterEvent, { label: string }>({
      initialState: () => 0,
      apply(state, event, context) {
        seen.push(`${context?.label}:${event.type}`);
        return state + 1;
      },
    });

    expect(projectEvents(model, [
      { type: "add", value: 1 },
      { type: "multiply", value: 2 },
    ], { label: "counter" })).toBe(2);
    expect(seen).toEqual(["counter:add", "counter:multiply"]);
  });

  it("preserves the model shape from defineReadModel", () => {
    const model: ReadModel<number, CounterEvent> = {
      initialState: () => 0,
      apply: (state) => state,
    };

    expect(defineReadModel(model)).toBe(model);
  });

  it("does not mutate the input event array", () => {
    const events: CounterEvent[] = [
      { type: "add", value: 1 },
      { type: "multiply", value: 3 },
    ];
    const before = [...events];
    const model = defineReadModel<number, CounterEvent>({
      initialState: () => 0,
      apply: (state) => state + 1,
    });

    projectEvents(model, events);

    expect(events).toEqual(before);
  });
});
