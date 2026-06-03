import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileHarnessStorage } from "@excelsior/agent-harness";
import { makeHarnessEvent, TEXT_DELTA, USER_INPUT } from "../src/events.js";

const tempDirs: string[] = [];

async function makeStorage() {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-"));
  tempDirs.push(dir);
  return new FileHarnessStorage(dir);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("FileHarnessStorage", () => {
  it("creates fresh file-backed workspaces and sessions", async () => {
    const storage = await makeStorage();
    const workspace = storage.getOrCreateWorkspace({
      id: "ws_test",
      rootPath: process.cwd(),
      name: "Test",
    });

    const session = storage.createSession(workspace.id, "Storage Test", "first prompt");
    const userInput = makeHarnessEvent({
      runId: "run_test",
      sessionId: session.id,
      sequence: 1,
      type: USER_INPUT,
      data: { content: "hello" },
    });
    const assistantText = makeHarnessEvent({
      runId: "run_test",
      sessionId: session.id,
      sequence: 2,
      type: TEXT_DELTA,
      data: { delta: "world" },
    });

    const updated = storage.appendEvent(workspace.id, session, userInput);
    storage.appendEvent(workspace.id, updated, assistantText);

    const loaded = storage.loadSessionFile(workspace.id, session.id);
    expect(loaded.session?.title).toBe("Storage Test");
    expect(loaded.events?.map((event) => event.type)).toEqual([USER_INPUT, TEXT_DELTA]);
  });

  it("renames and deletes sessions in the JSONL schema", async () => {
    const storage = await makeStorage();
    const workspace = storage.getOrCreateWorkspace({ id: "ws_test" });
    const session = storage.createSession(workspace.id, "Original");

    const renamed = storage.renameSession(workspace.id, session.id, "Renamed");
    expect(renamed?.title).toBe("Renamed");
    expect(storage.listSessions(workspace.id)[0]?.title).toBe("Renamed");

    storage.deleteSession(workspace.id, session.id);
    expect(storage.listSessions(workspace.id)).toEqual([]);
  });

  it("preserves existing settings when saving partial updates", async () => {
    const storage = await makeStorage();

    storage.saveSettings({ agentToolLoopSteps: "3", deepseekApiKey: "first" });
    const saved = storage.saveSettings({ githubToken: "token" });

    expect(saved.agentToolLoopSteps).toBe("3");
    expect(saved.deepseekApiKey).toBe("first");
    expect(saved.githubToken).toBe("token");
  });
});
