import { describe, expect, it } from "vitest";
import {
  createFakeSessionManager,
  createPendingRunHandle,
  createFakeTurnLifecycle,
} from "./helpers/agentApplication.js";

describe("test helper fixtures", () => {
  it("creates a fake session manager with workspace and CRUD behavior", async () => {
    const manager = createFakeSessionManager();

    const session = manager.createSession("Fixture");

    expect(manager.getWorkspace()).toEqual({
      id: "ws_test",
      name: "Test workspace",
      rootPath: "/tmp/workspace",
    });
    expect(manager.getCurrentSessionId()).toBe(session.id);

    await manager.deleteSession(session.id);

    expect(manager.getCurrentSessionId()).toBeNull();
    expect(manager.listSessions()).toEqual([]);
  });

  it("creates fake turn lifecycle run sessions with pending run handles", () => {
    const lifecycle = createFakeTurnLifecycle();
    const result = lifecycle.createRunSession({
      messages: [{ role: "user", content: "hello" }],
      createAgent: () => ({
        stream: async () => {},
      }),
      sessionId: "ses_test",
    });

    expect(result.run.sessionId).toBe("ses_test");
    expect(result.childRuns.size).toBe(0);
    expect(typeof result.handle.cancel).toBe("function");
  });

  it("creates cancellable pending run handles", () => {
    const handle = createPendingRunHandle();

    handle.cancel();

    expect(typeof handle.completion.then).toBe("function");
  });
});
