import { describe, expect, it, vi } from "vitest";
import { IntentRegistry } from "../src/host/intentRegistry.js";
import type { AgentHostIntent, AgentHostDispatchResult } from "@excelsior/client";

describe("IntentRegistry", () => {
  it("registers and dispatches handlers", async () => {
    const registry = new IntentRegistry();
    const handleFn = vi.fn(() => ({ type: "none" as const }));

    registry.register({
      type: "cancel",
      handle: handleFn,
    });

    expect(registry.has("cancel")).toBe(true);
    expect(registry.has("send")).toBe(false);

    const intent: AgentHostIntent = { type: "cancel" };
    const result = await registry.dispatch(intent);

    expect(result).toEqual({ type: "none" });
    expect(handleFn).toHaveBeenCalledWith(intent);
  });

  it("throws when dispatching unregistered intent", async () => {
    const registry = new IntentRegistry();
    const intent: AgentHostIntent = { type: "cancel" };

    await expect(registry.dispatch(intent)).rejects.toThrow(
      "No handler registered for intent: cancel",
    );
  });

  it("executes middleware in registration order", async () => {
    const registry = new IntentRegistry();
    const sequence: string[] = [];

    registry.use(async (intent, next) => {
      sequence.push("mw1-start");
      const res = await next();
      sequence.push("mw1-end");
      return res;
    });

    registry.use(async (intent, next) => {
      sequence.push("mw2-start");
      const res = await next();
      sequence.push("mw2-end");
      return res;
    });

    registry.register({
      type: "cancel",
      handle() {
        sequence.push("handler");
        return { type: "none" };
      },
    });

    const result = await registry.dispatch({ type: "cancel" });

    expect(result).toEqual({ type: "none" });
    expect(sequence).toEqual([
      "mw1-start",
      "mw2-start",
      "handler",
      "mw2-end",
      "mw1-end",
    ]);
  });

  it("allows middleware to short-circuit or modify results", async () => {
    const registry = new IntentRegistry();
    const handlerFn = vi.fn();

    registry.use(async (intent, next) => {
      // Short-circuit without calling next()
      return { type: "mode", mode: "plan" };
    });

    registry.register({
      type: "cancel",
      handle: handlerFn,
    });

    const result = await registry.dispatch({ type: "cancel" });

    expect(result).toEqual({ type: "mode", mode: "plan" });
    expect(handlerFn).not.toHaveBeenCalled();
  });
});
