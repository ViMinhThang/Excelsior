import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileHarnessStorage } from "@excelsior/agent-harness";
import { MESSAGE_END, MESSAGE_START, makeHarnessEvent } from "../src/events.js";

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

    const session = storage.createSession(workspace.id, "Storage Test");
    const userMessage = {
      id: "msg_user",
      role: "user" as const,
      content: "hello",
    };
    const userStart = makeHarnessEvent({
      workspaceId: workspace.id,
      runId: "run_test",
      sessionId: session.id,
      sequence: 1,
      type: MESSAGE_START,
      data: { message: userMessage },
    });
    const userEnd = makeHarnessEvent({
      workspaceId: workspace.id,
      runId: "run_test",
      sessionId: session.id,
      sequence: 2,
      type: MESSAGE_END,
      data: { message: userMessage },
    });

    const updated = storage.appendEvent(workspace.id, session, userStart);
    storage.appendEvent(workspace.id, updated, userEnd);

    const loaded = storage.loadSessionFile(workspace.id, session.id);
    expect(loaded.session?.title).toBe("Storage Test");
    expect(loaded.session?.metadata.userInput).toBe("hello");
    expect(loaded.events?.map((event) => event.type)).toEqual([MESSAGE_START, MESSAGE_END]);
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

  it("falls back to defaults for corrupt or wrong-shaped settings files", async () => {
    const storage = await makeStorage();
    await writeFile(join(storage.rootDir, "settings.json"), "{ not json", "utf-8");
    expect(storage.loadSettings()).toEqual({
      deepseekApiKey: "",
      githubToken: "",
      agentToolLoopSteps: "unlimited",
      autoReflectionEnabled: false,
      reflectionMemoryEnabled: false,
      autoApproveWorkspaceEdits: false,
    });

    await writeFile(join(storage.rootDir, "settings.json"), JSON.stringify({
      agentToolLoopSteps: { nested: true },
      autoReflectionEnabled: "false",
      futureSetting: "x",
    }), "utf-8");
    const loaded = storage.loadSettings();
    expect(loaded.agentToolLoopSteps).toBe("unlimited");
    expect(loaded.autoReflectionEnabled).toBe(true);
  });

  it("falls back to environment variables when settings are absent", async () => {
    const storage = await makeStorage();
    const previous = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "env-key";
    try {
      expect(storage.loadSettings().deepseekApiKey).toBe("env-key");
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = previous;
    }
  });

  it("normalizes invalid tool-loop budgets on save", async () => {
    const storage = await makeStorage();
    expect(storage.saveSettings({ agentToolLoopSteps: "banana" }).agentToolLoopSteps).toBe("unlimited");
  });

  it("treats wrong-shaped workspaces files as empty", async () => {
    const storage = await makeStorage();
    await writeFile(join(storage.rootDir, "workspaces.json"), JSON.stringify({ not: "an array" }), "utf-8");
    expect(storage.loadWorkspaces()).toEqual([]);
    expect(storage.getOrCreateWorkspace({ id: "ws_test" })).toBeDefined();
  });

  it("skips malformed session file lines and keeps the rest", async () => {
    const storage = await makeStorage();
    const workspace = storage.getOrCreateWorkspace({ id: "ws_test" });
    const session = storage.createSession(workspace.id, "Corrupt");
    const userMessage = {
      id: "msg_user",
      role: "user" as const,
      content: "hi",
    };
    storage.appendEvent(workspace.id, session, makeHarnessEvent({
      workspaceId: workspace.id,
      runId: "run_test",
      sessionId: session.id,
      sequence: 1,
      type: MESSAGE_END,
      data: { message: userMessage },
    }));

    const sessionPath = join(storage.rootDir, "sessions", workspace.id, `${session.id}.jsonl`);
    await appendFile(sessionPath, '{"kind":"event","event":{"type":"trunc",\n', "utf-8");
    await appendFile(sessionPath, '{"kind":"event","event":{"type":123}}\n', "utf-8");

    const loaded = storage.loadSessionFile(workspace.id, session.id);
    expect(loaded.session?.title).toBe("Corrupt");
    expect(loaded.session?.metadata.userInput).toBe("hi");
    expect(loaded.events?.length).toBe(1);
  });
});
