import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileHarnessStorage,
  InMemoryEventRepository,
  JsonlEventRepository,
  type EventRepository,
} from "@excelsior/agent-harness";
import { MESSAGE_END, MESSAGE_START, makeHarnessEvent } from "../src/events.js";

const tempDirs: string[] = [];

async function makeRepositories(): Promise<{ storage: FileHarnessStorage; events: JsonlEventRepository }> {
  const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-"));
  tempDirs.push(dir);
  const storage = new FileHarnessStorage(dir);
  return { storage, events: new JsonlEventRepository(storage.rootDir) };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("FileHarnessStorage", () => {
  it("creates fresh file-backed workspaces", async () => {
    const { storage } = await makeRepositories();
    const workspace = storage.getOrCreateWorkspace({
      id: "ws_test",
      rootPath: process.cwd(),
      name: "Test",
    });

    expect(workspace.id).toBe("ws_test");
    expect(storage.loadWorkspaces()).toEqual([workspace]);
  });

  it("preserves existing settings when saving partial updates", async () => {
    const { storage } = await makeRepositories();

    storage.saveSettings({ agentToolLoopSteps: "3", deepseekApiKey: "first" });
    const saved = storage.saveSettings({ githubToken: "token" });

    expect(saved.agentToolLoopSteps).toBe("3");
    expect(saved.deepseekApiKey).toBe("first");
    expect(saved.githubToken).toBe("token");
  });

  it("falls back to defaults for corrupt or wrong-shaped settings files", async () => {
    const { storage } = await makeRepositories();
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
    const { storage } = await makeRepositories();
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
    const { storage } = await makeRepositories();
    expect(storage.saveSettings({ agentToolLoopSteps: "banana" }).agentToolLoopSteps).toBe("unlimited");
  });

  it("treats wrong-shaped workspaces files as empty", async () => {
    const { storage } = await makeRepositories();
    await writeFile(join(storage.rootDir, "workspaces.json"), JSON.stringify({ not: "an array" }), "utf-8");
    expect(storage.loadWorkspaces()).toEqual([]);
    expect(storage.getOrCreateWorkspace({ id: "ws_test" })).toBeDefined();
  });
});

describe("JsonlEventRepository", () => {
  it("creates fresh file-backed sessions and derives metadata from events", async () => {
    const { events } = await makeRepositories();
    const session = events.createSession("ws_test", "Storage Test");
    const userMessage = {
      id: "msg_user",
      role: "user" as const,
      content: "hello",
    };
    const userStart = makeHarnessEvent({
      workspaceId: "ws_test",
      runId: "run_test",
      sessionId: session.id,
      sequence: 1,
      type: MESSAGE_START,
      data: { message: userMessage },
    });
    const userEnd = makeHarnessEvent({
      workspaceId: "ws_test",
      runId: "run_test",
      sessionId: session.id,
      sequence: 2,
      type: MESSAGE_END,
      data: { message: userMessage },
    });

    const updated = events.appendEvent("ws_test", session, userStart);
    events.appendEvent("ws_test", updated, userEnd);

    const loaded = events.loadSessionFile("ws_test", session.id);
    expect(loaded.session?.title).toBe("Storage Test");
    expect(loaded.session?.metadata.userInput).toBe("hello");
    expect(loaded.events?.map((event) => event.type)).toEqual([MESSAGE_START, MESSAGE_END]);
  });

  it("renames and deletes sessions in the JSONL schema", async () => {
    const { events } = await makeRepositories();
    const session = events.createSession("ws_test", "Original");

    const renamed = events.renameSession("ws_test", session.id, "Renamed");
    expect(renamed?.title).toBe("Renamed");
    expect(events.listSessions("ws_test")[0]?.title).toBe("Renamed");

    events.deleteSession("ws_test", session.id);
    expect(events.listSessions("ws_test")).toEqual([]);
  });

  it("replaces stored events for a session", async () => {
    const { events } = await makeRepositories();
    const session = events.createSession("ws_test", "Replace");
    const replacement = makeHarnessEvent({
      workspaceId: "ws_test",
      runId: "run_test",
      sessionId: session.id,
      sequence: 7,
      type: MESSAGE_END,
      data: { message: { id: "msg_x", role: "assistant", content: "done" } },
    });

    events.replaceEvents("ws_test", session, [replacement]);

    const loaded = events.loadSessionFile("ws_test", session.id);
    expect(loaded.events).toEqual([replacement]);
    expect(loaded.session?.metadata.userInput).toBe("");
  });

  it("skips malformed session file lines and keeps the rest", async () => {
    const { events } = await makeRepositories();
    const session = events.createSession("ws_test", "Corrupt");
    const userMessage = {
      id: "msg_user",
      role: "user" as const,
      content: "hi",
    };
    events.appendEvent("ws_test", session, makeHarnessEvent({
      workspaceId: "ws_test",
      runId: "run_test",
      sessionId: session.id,
      sequence: 1,
      type: MESSAGE_END,
      data: { message: userMessage },
    }));

    const sessionPath = join(events.rootDir, "sessions", "ws_test", `${session.id}.jsonl`);
    await appendFile(sessionPath, '{"kind":"event","event":{"type":"trunc",\n', "utf-8");
    await appendFile(sessionPath, '{"kind":"event","event":{"type":123}}\n', "utf-8");

    const loaded = events.loadSessionFile("ws_test", session.id);
    expect(loaded.session?.title).toBe("Corrupt");
    expect(loaded.session?.metadata.userInput).toBe("hi");
    expect(loaded.events?.length).toBe(1);
  });

  it("derives session metadata the same way as the JSONL repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "excelsior-harness-"));
    tempDirs.push(dir);
    const jsonl = new JsonlEventRepository(dir);
    const memory = new InMemoryEventRepository();

    for (const repository of [jsonl, memory] as EventRepository[]) {
      const session = repository.createSession("ws_test", "Title");
      const userEnd = makeHarnessEvent({
        workspaceId: "ws_test",
        runId: "run_test",
        sessionId: session.id,
        sequence: 1,
        type: MESSAGE_END,
        data: { message: { id: "msg_user", role: "user", content: "first words" } },
      });
      repository.appendEvent("ws_test", session, userEnd);

      const loaded = repository.loadSessionFile("ws_test", session.id);
      expect(loaded.session?.title).toBe("Title");
      expect(loaded.session?.metadata.userInput).toBe("first words");
      expect(loaded.events).toHaveLength(1);
    }
  });
});

describe("InMemoryEventRepository", () => {
  it("lists, renames, and deletes sessions", async () => {
    const repository = new InMemoryEventRepository();
    const session = repository.createSession("ws_test", "Original");

    const renamed = repository.renameSession("ws_test", session.id, "Renamed");
    expect(renamed?.title).toBe("Renamed");
    expect(repository.listSessions("ws_test")[0]?.title).toBe("Renamed");

    repository.deleteSession("ws_test", session.id);
    expect(repository.listSessions("ws_test")).toEqual([]);
  });

  it("replaces events and keeps loads consistent", async () => {
    const repository = new InMemoryEventRepository();
    const session = repository.createSession("ws_test", "Replace");
    const replacement = makeHarnessEvent({
      workspaceId: "ws_test",
      runId: "run_test",
      sessionId: session.id,
      sequence: 3,
      type: MESSAGE_END,
      data: { message: { id: "msg_x", role: "assistant", content: "done" } },
    });

    repository.replaceEvents("ws_test", session, [replacement]);

    expect(repository.loadEvents("ws_test", session.id)).toEqual([replacement]);
    expect(repository.loadSessionFile("ws_test", session.id).events).toEqual([replacement]);
    expect(repository.loadSessionFile("ws_test", "missing").events).toEqual([]);
  });
});
