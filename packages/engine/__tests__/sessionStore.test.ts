import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore, CHECKPOINT_VERSION } from "@excelsior/engine";
import type { TranscriptBlock } from "@excelsior/protocol";

function makeBlock(index: number): TranscriptBlock {
  const now = Date.now();
  return {
    id: `msg_${index}`,
    turnId: `turn_${index}`,
    kind: "assistant",
    content: `hello ${index}`,
    status: "completed",
    createdAt: now,
    finalizedAt: now,
  };
}

function block(id: string, turnId: string, content: string): TranscriptBlock {
  const now = Date.now();
  return {
    id,
    turnId,
    kind: "user",
    role: "user",
    content,
    status: "completed",
    createdAt: now,
    finalizedAt: now,
  };
}

describe("SessionStore", () => {
  let dataDir: string;
  let store: SessionStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "excelsior-engine-"));
    store = new SessionStore(dataDir, "test-workspace");
  });

  afterEach(() => {
    store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates a session with empty transcript and unique id", () => {
    const created = store.create("first session");
    const second = store.create("second session");
    expect(created.session.id).not.toBe(second.session.id);
    expect(created.blocks).toEqual([]);
    expect(created.interaction).toEqual({ confirmation: null, question: null });
    expect(created.lastTurnId).toBeNull();
    expect(created.session.metadata.userInput).toBe("first session");
  });

  it("checkpoint round-trips through a fresh store instance", () => {
    const created = store.create("round trip");
    store.appendBlocks(created.session.id, [block("msg_1", "turn_1", "hi")]);
    store.checkpoint(created.session.id);

    const reloaded = new SessionStore(dataDir, "test-workspace");
    const state = reloaded.load(created.session.id);
    expect(state).not.toBeNull();
    expect(state!.blocks).toHaveLength(1);
    expect(state!.blocks[0]).toMatchObject({ id: "msg_1", content: "hi" });
    expect(state!.session.metadata.userInput).toBe("round trip");
  });

  it("writes atomically: no tmp files left and file is valid JSON", () => {
    const created = store.create("atomic");
    store.appendBlocks(created.session.id, [makeBlock(1)]);
    store.checkpoint(created.session.id);

    const files = readdirSync(join(dataDir, "sessions", "test-workspace"));
    expect(files).toEqual([`${created.session.id}.json`]);
    const parsed = JSON.parse(
      readFileSync(join(dataDir, "sessions", "test-workspace", `${created.session.id}.json`), "utf8"),
    );
    expect(parsed.version).toBe(CHECKPOINT_VERSION);
    expect(parsed.blocks).toHaveLength(1);
  });

  it("debounces block writes and flushes on checkpoint()", async () => {
    const debounced = new SessionStore(dataDir, "test-workspace", { debounceMs: 30 });
    const created = debounced.create("debounced");
    debounced.appendBlocks(created.session.id, [block("msg_1", "t", "a")]);
    debounced.appendBlocks(created.session.id, [block("msg_2", "t", "b")]);

    const dir = join(dataDir, "sessions", "test-workspace");
    const path = join(dir, `${created.session.id}.json`);
    expect(JSON.parse(readFileSync(path, "utf8")).blocks).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(JSON.parse(readFileSync(path, "utf8")).blocks.map((b: { content: string }) => b.content)).toEqual([
      "a",
      "b",
    ]);

    debounced.appendBlocks(created.session.id, [block("msg_3", "t", "c")]);
    debounced.checkpoint(created.session.id);
    const state = new SessionStore(dataDir, "test-workspace").load(created.session.id);
    expect(state!.blocks.map((b) => b.content)).toEqual(["a", "b", "c"]);
  });

  it("flush() writes all dirty sessions immediately", () => {
    const a = store.create("a");
    const b = store.create("b");
    store.appendBlocks(a.session.id, [makeBlock(1)]);
    store.appendBlocks(b.session.id, [makeBlock(2)]);
    store.flush();

    const dir = join(dataDir, "sessions", "test-workspace");
    expect(readdirSync(dir).sort()).toEqual(
      [a.session.id, b.session.id].map((id) => `${id}.json`).sort(),
    );
  });

  it("moves corrupt checkpoints to .broken and returns null", () => {
    const created = store.create("corrupt me");
    store.checkpoint(created.session.id);
    const path = join(dataDir, "sessions", "test-workspace", `${created.session.id}.json`);
    writeFileSync(path, "{ not valid json", "utf8");

    expect(new SessionStore(dataDir, "test-workspace").load(created.session.id)).toBeNull();
    const files = readdirSync(join(dataDir, "sessions", "test-workspace"));
    expect(files).toEqual([`${created.session.id}.json.broken`]);
  });

  it("rejects checkpoints with a mismatched version", () => {
    const created = store.create("old version");
    store.checkpoint(created.session.id);
    const path = join(dataDir, "sessions", "test-workspace", `${created.session.id}.json`);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.version = 1;
    writeFileSync(path, JSON.stringify(parsed), "utf8");

    expect(new SessionStore(dataDir, "test-workspace").load(created.session.id)).toBeNull();
  });

  it("lists sessions newest-first including persisted ones", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const a = store.create("a");
      store.appendBlocks(a.session.id, [makeBlock(1)]);
      store.checkpoint(a.session.id);
      vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
      const b = store.create("b");
      store.appendBlocks(b.session.id, [makeBlock(2)]);
      store.checkpoint(b.session.id);
    } finally {
      vi.useRealTimers();
    }

    const reloaded = new SessionStore(dataDir, "test-workspace");
    const list = reloaded.list();
    expect(list.map((s) => s.metadata.userInput)).toEqual(["b", "a"]);
  });

  it("rename, clear, and delete behave correctly", () => {
    const created = store.create("title");
    store.appendBlocks(created.session.id, [makeBlock(1)]);
    store.checkpoint(created.session.id);

    store.rename(created.session.id, "new title");
    expect(store.load(created.session.id)!.session.title).toBe("new title");

    store.clear(created.session.id);
    const cleared = store.load(created.session.id)!;
    expect(cleared.blocks).toEqual([]);
    expect(cleared.lastTurnId).toBeNull();

    store.delete(created.session.id);
    expect(store.load(created.session.id)).toBeNull();
    const reloaded = new SessionStore(dataDir, "test-workspace");
    expect(reloaded.load(created.session.id)).toBeNull();
    expect(reloaded.list()).toEqual([]);
  });
});
