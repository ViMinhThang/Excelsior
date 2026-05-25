import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalAgentHost,
  resetDefaultAgentHost,
} from "@excelsior/agent-host";
import { resetDb } from "@excelsior/agent-host/testing/persistence";
import { confirmBus } from "@excelsior/agent-host/testing/runtime";

describe("LocalAgentHost", () => {
  beforeEach(() => {
    process.env.EXCELSIOR_DB_PATH = ":memory:";
    resetDefaultAgentHost();
    resetDb();
  });

  it("exposes a serializable client state without runtime instances", () => {
    const host = new LocalAgentHost();

    const state = host.getState();

    expect(() => JSON.stringify(state)).not.toThrow();
    expect(state).toMatchObject({
      displayBlocks: [],
      isLoading: false,
      currentSessionId: null,
      workspace: expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        rootPath: expect.any(String),
      }),
      mode: "plan",
      pendingConfirmation: null,
    });
    expect("activeRun" in state).toBe(false);

    host.dispose();
  });

  it("executes backend-owned commands through the host contract", async () => {
    const host = new LocalAgentHost();

    const result = await host.dispatch({
      type: "execute-command",
      input: "/mode act",
    });

    expect(result).toMatchObject({
      type: "command-result",
      result: {
      handled: true,
      message: "Mode switched to Act.",
      clearInput: true,
      },
    });
    expect(host.getState().mode).toBe("act");

    host.dispose();
  });

  it("keeps tool confirmation state behind the host", () => {
    const host = new LocalAgentHost();

    confirmBus.emit("request", {
      callId: "call_1",
      toolName: "writeFile",
      args: "{\"filePath\":\"demo.ts\"}",
      filePath: "demo.ts",
      action: "edit",
      diff: "--- demo.ts\n+++ demo.ts",
    });

    expect(host.getState().pendingConfirmation?.callId).toBe("call_1");

    void host.dispatch({
      type: "respond-to-confirmation",
      callId: "call_1",
      approved: true,
    });

    expect(host.getState().pendingConfirmation).toBeNull();

    host.dispose();
  });

  it("notifies subscribers when confirmation state changes", () => {
    const host = new LocalAgentHost();
    const listener = vi.fn();
    host.subscribe(listener);

    confirmBus.emit("request", {
      callId: "call_1",
      toolName: "writeFile",
      args: "{\"filePath\":\"demo.ts\"}",
      filePath: "demo.ts",
      action: "edit",
      diff: "--- demo.ts\n+++ demo.ts",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.getState().pendingConfirmation?.callId).toBe("call_1");

    void host.dispatch({
      type: "respond-to-confirmation",
      callId: "call_1",
      approved: false,
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(host.getState().pendingConfirmation).toBeNull();

    host.dispose();
  });
});
