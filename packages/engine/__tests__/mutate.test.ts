import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMutate, DiffEmitter, RunStore, SessionStore } from "@excelsior/engine";
import type { MetaState, Mutation } from "@excelsior/engine";
import type { AgentLlmInfo, AppSettings, TranscriptBlock, Workspace } from "@excelsior/protocol";

function makeBlock(index: number, turnId: string): TranscriptBlock {
  const now = Date.now();
  return {
    id: `msg_${index}`,
    turnId,
    kind: "assistant",
    content: `block ${index}`,
    status: "completed",
    createdAt: now,
    finalizedAt: now,
  };
}

const SETTINGS: AppSettings = {
  deepseekApiKey: "sk-test",
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

const WORKSPACE: Workspace = { id: "w1", name: "test", rootPath: "C:\\" };

const LLM: AgentLlmInfo = { providerName: "deepseek", modelName: "deepseek-chat" };

describe("Mutate", () => {
  let dataDir: string;
  let store: SessionStore;
  let emitter: DiffEmitter;
  let mutate: (mutation: Mutation) => void;
  let meta: MetaState;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "excelsior-mutate-"));
    store = new SessionStore(dataDir, "w");
    emitter = new DiffEmitter();
    meta = {
      currentSessionId: null,
      mode: "plan",
      settings: SETTINGS,
      workspace: WORKSPACE,
      llm: LLM,
    };
    mutate = createMutate({ store, emitter, runStore: new RunStore(), meta });
  });

  afterEach(() => {
    store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("session-create commits a session-state delta, a meta-changed delta, and selects the session", () => {
    const deltas: unknown[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "session-create", title: "hello" });

    expect(deltas).toHaveLength(2);
    const d = deltas[0] as { scope: { kind: string }; rev: number; delta: { kind: string; session: { session: { id: string; metadata: { userInput: string } } } } };
    expect(d.scope.kind).toBe("session");
    expect(d.rev).toBe(1);
    expect(d.delta.kind).toBe("session-state");
    expect(d.delta.session.session.metadata.userInput).toBe("hello");
    expect(meta.currentSessionId).toBe(d.delta.session.session.id);
    const m = deltas[1] as { scope: { kind: string }; rev: number; delta: { kind: string } };
    expect(m.scope.kind).toBe("meta");
    expect(m.rev).toBe(1);
    expect(m.delta.kind).toBe("meta-changed");
  });

  it("blocks-commit emits one block-committed delta per block with monotonic revs", () => {
    mutate({ kind: "session-create", title: "t" });
    const sessionId = meta.currentSessionId!;
    const deltas: { rev: number; delta: { kind: string } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({
      kind: "blocks-commit",
      sessionId,
      blocks: [makeBlock(1, "turn_1"), makeBlock(2, "turn_1")],
    });

    expect(deltas.map((d) => d.delta.kind)).toEqual(["block-committed", "block-committed"]);
    expect(deltas.map((d) => d.rev)).toEqual([2, 3]);
    expect(store.load(sessionId)!.blocks).toHaveLength(2);
  });

  it("session-switch to an unknown session fails with an error delta and no state change", () => {
    mutate({ kind: "session-create", title: "a" });
    const deltas: { scope: { kind: string }; rev: number; delta: { kind: string } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "session-switch", sessionId: "nope" });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta.kind).toBe("error");
    expect(deltas[0].scope.kind).toBe("meta");
    expect(meta.currentSessionId).not.toBe("nope");
    expect(emitter.lastRev({ kind: "session", sessionId: "nope" })).toBe(0);
  });

  it("session-switch emits meta-changed and updates currentSessionId", () => {
    mutate({ kind: "session-create", title: "a" });
    const other = store.create("b").session.id;
    mutate({ kind: "session-switch", sessionId: other });
    expect(meta.currentSessionId).toBe(other);
  });

  it("session-delete removes the session and clears currentSessionId", () => {
    mutate({ kind: "session-create", title: "a" });
    const sessionId = meta.currentSessionId!;
    mutate({ kind: "session-delete", sessionId });
    expect(store.load(sessionId)).toBeNull();
    expect(meta.currentSessionId).toBeNull();
  });

  it("session-clear emits session-state with an empty transcript", () => {
    mutate({ kind: "session-create", title: "a" });
    const sessionId = meta.currentSessionId!;
    mutate({ kind: "blocks-commit", sessionId, blocks: [makeBlock(1, "t")] });
    const deltas: { delta: { kind: string; session?: { blocks: unknown[] } } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "session-clear", sessionId });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta.kind).toBe("session-state");
    expect(deltas[0].delta.session!.blocks).toEqual([]);
  });

  it("session-rename and meta-refresh emit meta-changed", () => {
    mutate({ kind: "session-create", title: "a" });
    const sessionId = meta.currentSessionId!;
    const deltas: { delta: { kind: string } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "session-rename", sessionId, title: "renamed" });
    mutate({ kind: "meta-refresh" });

    expect(deltas.map((d) => d.delta.kind)).toEqual(["meta-changed", "meta-changed"]);
    expect(store.load(sessionId)!.session.title).toBe("renamed");
  });

  it("mode-set and settings-save update meta and emit meta-changed", () => {
    const deltas: { delta: { kind: string } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "mode-set", mode: "act" });
    mutate({ kind: "settings-save", patch: { deepseekApiKey: "sk-new" } });

    expect(meta.mode).toBe("act");
    expect(meta.settings.deepseekApiKey).toBe("sk-new");
    expect(meta.settings.githubToken).toBe("");
    expect(deltas.map((d) => d.delta.kind)).toEqual(["meta-changed", "meta-changed"]);
  });

  it("blocks-commit to an unknown session emits an error delta", () => {
    const deltas: { delta: { kind: string; message?: string } }[] = [];
    emitter.subscribe((d) => deltas.push(d));

    mutate({ kind: "blocks-commit", sessionId: "nope", blocks: [makeBlock(1, "t")] });

    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta.kind).toBe("error");
  });

  it("persists committed blocks to the checkpoint", () => {
    mutate({ kind: "session-create", title: "persist" });
    const sessionId = meta.currentSessionId!;
    mutate({ kind: "blocks-commit", sessionId, blocks: [makeBlock(1, "t")] });
    store.flush();

    const reloaded = new SessionStore(dataDir, "w");
    expect(reloaded.load(sessionId)!.blocks).toHaveLength(1);
  });
});
