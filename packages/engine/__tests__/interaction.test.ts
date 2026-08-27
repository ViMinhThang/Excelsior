import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMutate,
  DiffEmitter,
  InteractionManager,
  RunStore,
  SessionStore,
} from "@excelsior/engine";
import type { MetaState, Mutation } from "@excelsior/engine";
import type {
  AgentLlmInfo,
  AppSettings,
  AskQuestionRequest,
  ConfirmRequest,
  WireDelta,
  Workspace,
} from "@excelsior/protocol";

const SETTINGS: AppSettings = {
  githubToken: "",
  agentToolLoopSteps: "unlimited",
  autoReflectionEnabled: false,
};

const WORKSPACE: Workspace = { id: "w1", name: "test", rootPath: "C:\\" };
const LLM: AgentLlmInfo = { providerName: "deepseek", modelName: "deepseek-chat" };

const CONFIRM: ConfirmRequest = {
  callId: "call_1",
  toolName: "edit",
  args: "{}",
  filePath: "a.ts",
  action: "edit",
  diff: "--- a\n+++ b",
};

function makeQuestion(callId: string): AskQuestionRequest {
  return {
    callId,
    question: "which one?",
    options: [{ id: "opt1", label: "one" }],
    allowManual: true,
  };
}

describe("InteractionManager", () => {
  let dataDir: string;
  let store: SessionStore;
  let emitter: DiffEmitter;
  let runStore: RunStore;
  let mutate: (mutation: Mutation) => void;
  let meta: MetaState;
  let manager: InteractionManager;
  let deltas: WireDelta[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "excelsior-interaction-"));
    store = new SessionStore(dataDir, "w");
    emitter = new DiffEmitter();
    runStore = new RunStore();
    meta = {
      currentSessionId: null,
      mode: "plan",
      settings: SETTINGS,
      workspace: WORKSPACE,
      llm: LLM,
    };
    mutate = createMutate({ store, emitter, runStore, meta });
    manager = new InteractionManager({ mutate, emitter, meta });
    deltas = [];
    emitter.subscribe((d) => deltas.push(d));
    mutate({ kind: "session-create", title: "s" });
  });

  afterEach(() => {
    store.flush();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("requestConfirmation blocks until respondToConfirmation resolves it", async () => {
    const promise = manager.requestConfirmation(CONFIRM);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(promise).toBeInstanceOf(Promise);

    manager.respondToConfirmation(CONFIRM.callId, true);
    await expect(promise).resolves.toBe(true);

    const state = store.load(meta.currentSessionId!)!;
    expect(state.interaction.confirmation).toMatchObject({
      callId: "call_1",
      approved: true,
    });
    const interactionDeltas = deltas.filter((d) => d.delta.kind === "interaction");
    expect(interactionDeltas).toHaveLength(2);
  });

  it("requestConfirmation rejects with false when cancelAll clears the slot", async () => {
    const promise = manager.requestConfirmation(CONFIRM);
    manager.cancelAll();
    await expect(promise).resolves.toBe(false);
    expect(store.load(meta.currentSessionId!)!.interaction).toEqual({
      confirmation: null,
      question: null,
    });
  });

  it("requestQuestion resolves with the answer on respondToQuestion", async () => {
    const request = makeQuestion("q1");
    const promise = manager.requestQuestion(request);
    manager.respondToQuestion({ callId: "q1", answer: "one", isManual: true });
    await expect(promise).resolves.toMatchObject({ answer: "one", isManual: true });
  });

  it("approveAllConfirmations approves the pending confirmation", async () => {
    const promise = manager.requestConfirmation(CONFIRM);
    manager.approveAllConfirmations();
    await expect(promise).resolves.toBe(true);
  });

  it("requesting a confirmation while one is pending emits an error delta", () => {
    manager.requestConfirmation(CONFIRM);
    const second: ConfirmRequest = { ...CONFIRM, callId: "call_2" };
    manager.requestConfirmation(second);

    const last = deltas[deltas.length - 1];
    expect(last.delta.kind).toBe("error");
    const state = store.load(meta.currentSessionId!)!;
    expect(state.interaction.confirmation!.callId).toBe("call_1");
  });

  it("responding with a stale callId emits an error delta", () => {
    manager.requestConfirmation(CONFIRM);
    manager.respondToConfirmation("stale", true);
    expect(deltas[deltas.length - 1].delta.kind).toBe("error");
  });

  it("interaction state checkpoints with the session", async () => {
    const promise = manager.requestConfirmation(CONFIRM);
    store.flush();
    const reloaded = new SessionStore(dataDir, "w");
    const state = reloaded.load(meta.currentSessionId!)!;
    expect(state.interaction.confirmation!.callId).toBe("call_1");
    manager.respondToConfirmation(CONFIRM.callId, true);
    await expect(promise).resolves.toBe(true);
  });

  it("run-begin auto-clears unanswered interactions from a previous run", () => {
    manager.requestConfirmation(CONFIRM);
    const turn = {
      id: "t2",
      sessionId: meta.currentSessionId!,
      status: "running" as const,
      userContent: "x",
      steps: [],
      blocks: [],
      startedAt: Date.now(),
    };
    mutate({ kind: "run-begin", turn });

    const state = store.load(meta.currentSessionId!)!;
    expect(state.interaction).toEqual({ confirmation: null, question: null });
  });
});
