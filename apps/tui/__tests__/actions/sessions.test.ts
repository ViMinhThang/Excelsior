import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../src/store/store.js";
import { createInitialState } from "../../src/store/types.js";
import { ACTION_REGISTRY, dispatchAction } from "../../src/actions/registry.js";
import "../../src/actions/index.js";
import { setBridge } from "../../src/actions/bridge.js";

describe("session actions and registry", () => {
  it("registers all required actions in ACTION_REGISTRY", () => {
    const required = [
      "session-list.switch",
      "session-list.delete",
      "session-list.create",
      "session-list.move",
      "app.openSessions",
      "app.newSession",
      "app.deleteSession",
      "app.openSettings",
      "overlay.dismiss",
      "confirm.approve",
      "confirm.deny",
      "question.select",
    ];
    for (const name of required) {
      expect(ACTION_REGISTRY[name], `Expected ${name} to be registered in ACTION_REGISTRY`).toBeDefined();
    }
  });

  it("handles session-list.create by sending session-create command to bridge", async () => {
    const store = createStore(createInitialState({ id: "ws", name: "ws", rootPath: "/ws" }));
    const mockBridge = {
      command: vi.fn().mockResolvedValue({ ok: true }),
      request: vi.fn(),
      onNotification: vi.fn(),
      stop: vi.fn(),
    };
    setBridge(mockBridge as any);

    const dispatched = dispatchAction(store, "session-list.create");
    expect(dispatched).toBe(true);
    expect(mockBridge.command).toHaveBeenCalledWith({ cmd: "session-create" });
  });

  it("handles session-list.delete by sending session-delete command to bridge", async () => {
    const store = createStore(
      createInitialState({ id: "ws", name: "ws", rootPath: "/ws" }),
    );
    store.dispatch(() => ({
      meta: {
        sessions: [
          { id: "s1", title: "Session 1", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: { userInput: "Hello" } },
          { id: "s2", title: "Session 2", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), metadata: { userInput: "World" } },
        ],
        currentSessionId: "s1",
        workspace: { id: "ws", name: "ws", rootPath: "/ws" },
        llm: { modelName: "DeepSeek", providerName: "deepseek" },
      },
      overlay: { kind: "session-list", state: { cursor: 1 } },
    }));

    const mockBridge = {
      command: vi.fn().mockResolvedValue({ ok: true }),
      request: vi.fn(),
      onNotification: vi.fn(),
      stop: vi.fn(),
    };
    setBridge(mockBridge as any);

    const dispatched = dispatchAction(store, "session-list.delete");
    expect(dispatched).toBe(true);
    expect(mockBridge.command).toHaveBeenCalledWith({ cmd: "session-delete", sessionId: "s2" });
  });
});
