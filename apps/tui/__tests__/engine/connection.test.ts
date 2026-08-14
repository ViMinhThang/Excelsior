import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentCommand, CommandAck } from "@excelsior/protocol";
import type { AgentClient } from "@excelsior/client";
import { createStore } from "../../src/store/store.js";
import { createInitialState } from "../../src/store/types.js";
import { ensureActiveSession } from "../../src/engine/connection.js";

function makeStore() {
  const store = createStore(createInitialState({ id: "w", name: "w", rootPath: "C:\\w" }));
  return store;
}

function makeClient() {
  return {
    command: vi.fn(async (_cmd: AgentCommand): Promise<CommandAck> => ({ ok: true })),
  } as unknown as AgentClient;
}

describe("ensureActiveSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session when none exists", async () => {
    const store = makeStore();
    const client = makeClient();
    await ensureActiveSession(client, store);
    expect(client.command).toHaveBeenCalledWith({ cmd: "session-create" });
  });

  it("switches to the most recent session when sessions exist but none is active", async () => {
    const store = makeStore();
    store.dispatch((s) => ({
      meta: {
        ...s.meta,
        sessions: [
          { id: "newest", startedAt: "", updatedAt: "b", metadata: { userInput: "" }, title: "newest" },
          { id: "older", startedAt: "", updatedAt: "a", metadata: { userInput: "" }, title: "older" },
        ],
      },
    }));
    const client = makeClient();
    await ensureActiveSession(client, store);
    expect(client.command).toHaveBeenCalledWith({ cmd: "session-switch", sessionId: "newest" });
  });

  it("does nothing when a session is already active", async () => {
    const store = makeStore();
    store.dispatch((s) => ({ meta: { ...s.meta, currentSessionId: "active" } }));
    const client = makeClient();
    await ensureActiveSession(client, store);
    expect(client.command).not.toHaveBeenCalled();
  });
});
