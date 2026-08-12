import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  LiveBlock,
  RunToolState,
  TranscriptBlock,
  Workspace,
} from "@excelsior/protocol";
import { DiffEmitter } from "./diffEmitter.js";
import { latestStep, turnToTranscriptBlocks } from "./aiHistory.js";
import { RunStore, type RunToolCall, type RunTurn } from "./runStore.js";
import { SessionStore } from "./sessionStore.js";

export type Mutation =
  | { kind: "session-create"; title?: string }
  | { kind: "session-switch"; sessionId: string }
  | { kind: "session-delete"; sessionId: string }
  | { kind: "session-rename"; sessionId: string; title: string }
  | { kind: "session-clear"; sessionId: string }
  | { kind: "blocks-commit"; sessionId: string; blocks: TranscriptBlock[] }
  | { kind: "mode-set"; mode: AgentMode }
  | { kind: "settings-save"; patch: Partial<AppSettings> }
  | { kind: "meta-refresh" }
  | { kind: "run-begin"; turn: RunTurn }
  | { kind: "run-text"; turnId: string; content: string }
  | { kind: "run-tool-start"; turnId: string; call: RunToolCall }
  | { kind: "run-tool-update"; callId: string; result: string }
  | { kind: "run-tool-end"; callId: string; result: string; isError?: boolean }
  | { kind: "run-commit"; turnId: string }
  | { kind: "run-cancel"; turnId: string; reason?: string }
  | { kind: "run-fail"; turnId: string; error: string }
  | { kind: "interaction-confirm-request"; callId: string; request: ConfirmRequest }
  | { kind: "interaction-confirm-respond"; callId: string; approved: boolean }
  | { kind: "interaction-confirm-approve-all" }
  | { kind: "interaction-confirm-cancel-all" }
  | { kind: "interaction-question-request"; callId: string; request: AskQuestionRequest }
  | { kind: "interaction-question-respond"; callId: string; response: AskQuestionResponse };

export interface MetaState {
  currentSessionId: string | null;
  mode: AgentMode;
  settings: AppSettings;
  workspace: Workspace;
  llm: AgentLlmInfo;
}

export interface Mutate {
  (mutation: Mutation): void;
}

interface MutateDeps {
  store: SessionStore;
  emitter: DiffEmitter;
  runStore: RunStore;
  meta: MetaState;
}

function toToolState(call: RunToolCall): RunToolState {
  return {
    id: call.id,
    toolName: call.toolName,
    args: call.args,
    status: call.status,
    result: call.result,
    isError: call.isError,
  };
}

function assistantBlock(turn: RunTurn): LiveBlock {
  const last = turn.blocks[turn.blocks.length - 1];
  if (last && last.kind === "assistant") return last;
  const block: LiveBlock = {
    id: `assistant_${turn.id}`,
    turnId: turn.id,
    kind: "assistant",
    content: "",
  };
  turn.blocks.push(block);
  return block;
}

export function createMutate({ store, emitter, runStore, meta }: MutateDeps): Mutate {
  const sessionScope = (sessionId: string) => ({ kind: "session", sessionId }) as const;
  const runScope = (sessionId: string) => ({ kind: "run", sessionId }) as const;

  const fail = (message: string): void => {
    emitter.emit(
      { kind: "meta" },
      { scope: { kind: "meta" }, delta: { kind: "error", message } },
    );
  };

  const commitTurn = (turn: RunTurn, runStatus: "committed" | "cancelled" | "failed"): void => {
    turn.status = runStatus;
    const blocks = turnToTranscriptBlocks(turn);
    store.appendBlocks(turn.sessionId, blocks);
    store.checkpoint(turn.sessionId);
    for (const block of blocks) {
      emitter.emit(
        sessionScope(turn.sessionId),
        { scope: sessionScope(turn.sessionId), delta: { kind: "block-committed", block } },
      );
    }
    runStore.clear();
    emitter.emit(
      runScope(turn.sessionId),
      { scope: runScope(turn.sessionId), delta: { kind: "run-status", status: runStatus, turnId: turn.id } },
    );
  };

  const findCall = (callId: string): RunToolCall | undefined =>
    runStore.activeTurn?.steps.flatMap((step) => step.toolCalls).find((call) => call.id === callId);

  const emitInteraction = (sessionId: string): void => {
    const state = store.load(sessionId);
    if (!state) return;
    emitter.emit(
      sessionScope(sessionId),
      { scope: sessionScope(sessionId), delta: { kind: "interaction", interaction: state.interaction } },
    );
  };

  return (mutation) => {
    switch (mutation.kind) {
      case "session-create": {
        const state = store.create(mutation.title ?? "New Session");
        meta.currentSessionId = state.session.id;
        emitter.emit(
          sessionScope(state.session.id),
          {
            scope: sessionScope(state.session.id),
            delta: { kind: "session-state", session: state },
          },
        );
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "session-switch": {
        if (!store.load(mutation.sessionId)) {
          return fail(`unknown session ${mutation.sessionId}`);
        }
        meta.currentSessionId = mutation.sessionId;
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "session-delete": {
        if (!store.load(mutation.sessionId)) {
          return fail(`unknown session ${mutation.sessionId}`);
        }
        store.delete(mutation.sessionId);
        if (meta.currentSessionId === mutation.sessionId) {
          meta.currentSessionId = null;
        }
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "session-rename": {
        if (!store.load(mutation.sessionId)) {
          return fail(`unknown session ${mutation.sessionId}`);
        }
        store.rename(mutation.sessionId, mutation.title);
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "session-clear": {
        if (!store.load(mutation.sessionId)) {
          return fail(`unknown session ${mutation.sessionId}`);
        }
        store.clear(mutation.sessionId);
        const state = store.load(mutation.sessionId)!;
        emitter.emit(
          sessionScope(mutation.sessionId),
          {
            scope: sessionScope(mutation.sessionId),
            delta: { kind: "session-state", session: state },
          },
        );
        return;
      }
      case "blocks-commit": {
        if (!store.load(mutation.sessionId)) {
          return fail(`unknown session ${mutation.sessionId}`);
        }
        store.appendBlocks(mutation.sessionId, mutation.blocks);
        for (const block of mutation.blocks) {
          emitter.emit(
            sessionScope(mutation.sessionId),
            {
              scope: sessionScope(mutation.sessionId),
              delta: { kind: "block-committed", block },
            },
          );
        }
        return;
      }
      case "mode-set": {
        meta.mode = mutation.mode;
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "settings-save": {
        meta.settings = { ...meta.settings, ...mutation.patch };
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "meta-refresh": {
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
        );
        return;
      }
      case "run-begin": {
        if (runStore.isActive()) {
          return fail("run already active");
        }
        const existing = store.load(mutation.turn.sessionId);
        if (
          existing &&
          (existing.interaction.confirmation?.approved === null ||
            existing.interaction.question?.response === null)
        ) {
          store.clearInteraction(mutation.turn.sessionId);
          emitInteraction(mutation.turn.sessionId);
        }
        runStore.begin(mutation.turn);
        emitter.emit(
          runScope(mutation.turn.sessionId),
          {
            scope: runScope(mutation.turn.sessionId),
            delta: { kind: "run-status", status: "running", turnId: mutation.turn.id },
          },
        );
        return;
      }
      case "run-text": {
        const turn = runStore.activeTurn;
        if (!turn || turn.id !== mutation.turnId) {
          return fail(`no active run for turn ${mutation.turnId}`);
        }
        if (turn.status !== "running") return fail("run is not running");
        const step = latestStep(turn);
        step.modelOutput += mutation.content;
        const block = assistantBlock(turn);
        block.content += mutation.content;
        emitter.emit(
          runScope(turn.sessionId),
          {
            scope: runScope(turn.sessionId),
            delta: { kind: "run-text-delta", turnId: turn.id, content: mutation.content },
          },
        );
        return;
      }
      case "run-tool-start": {
        const turn = runStore.activeTurn;
        if (!turn || turn.id !== mutation.turnId) {
          return fail(`no active run for turn ${mutation.turnId}`);
        }
        const step = latestStep(turn);
        step.toolCalls.push(mutation.call);
        turn.blocks.push({
          id: mutation.call.id,
          turnId: turn.id,
          kind: "tool-call",
          content: "",
          tool: {
            id: mutation.call.id,
            toolName: mutation.call.toolName,
            args: typeof mutation.call.args === "string" ? mutation.call.args : JSON.stringify(mutation.call.args),
          },
        });
        emitter.emit(
          runScope(turn.sessionId),
          { scope: runScope(turn.sessionId), delta: { kind: "run-tool", tool: toToolState(mutation.call) } },
        );
        return;
      }
      case "run-tool-update": {
        const turn = runStore.activeTurn;
        const call = turn ? findCall(mutation.callId) : undefined;
        if (!turn || !call) return fail(`unknown tool call ${mutation.callId}`);
        call.result = (call.result ?? "") + mutation.result;
        const block = turn.blocks.find((b) => b.id === mutation.callId);
        if (block?.tool) block.tool.result = call.result;
        emitter.emit(
          runScope(turn.sessionId),
          { scope: runScope(turn.sessionId), delta: { kind: "run-tool", tool: toToolState(call) } },
        );
        return;
      }
      case "run-tool-end": {
        const turn = runStore.activeTurn;
        const call = turn ? findCall(mutation.callId) : undefined;
        if (!turn || !call) return fail(`unknown tool call ${mutation.callId}`);
        call.result = mutation.result;
        call.isError = mutation.isError ?? false;
        call.status = call.isError ? "error" : "done";
        call.endedAt = Date.now();
        const block = turn.blocks.find((b) => b.id === mutation.callId);
        if (block?.tool) {
          block.tool.result = call.result;
          block.tool.isError = call.isError;
        }
        emitter.emit(
          runScope(turn.sessionId),
          { scope: runScope(turn.sessionId), delta: { kind: "run-tool", tool: toToolState(call) } },
        );
        return;
      }
      case "run-commit": {
        const turn = runStore.activeTurn;
        if (!turn || turn.id !== mutation.turnId) {
          return fail(`no active run for turn ${mutation.turnId}`);
        }
        if (turn.status !== "running") return fail("run is not running");
        commitTurn(turn, "committed");
        return;
      }
      case "run-cancel": {
        const turn = runStore.activeTurn;
        if (!turn || turn.id !== mutation.turnId) {
          return fail(`no active run for turn ${mutation.turnId}`);
        }
        commitTurn(turn, "cancelled");
        return;
      }
      case "run-fail": {
        const turn = runStore.activeTurn;
        if (!turn || turn.id !== mutation.turnId) {
          return fail(`no active run for turn ${mutation.turnId}`);
        }
        turn.error = mutation.error;
        commitTurn(turn, "failed");
        emitter.emit(
          { kind: "meta" },
          { scope: { kind: "meta" }, delta: { kind: "error", message: mutation.error } },
        );
        return;
      }
      case "interaction-confirm-request": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        if (state.interaction.confirmation?.approved === null) {
          return fail("confirmation already pending");
        }
        store.setInteraction(sessionId, {
          ...state.interaction,
          confirmation: { callId: mutation.callId, request: mutation.request, approved: null },
        });
        emitInteraction(sessionId);
        return;
      }
      case "interaction-confirm-respond": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        const pending = state.interaction.confirmation;
        if (!pending || pending.callId !== mutation.callId) {
          return fail(`no pending confirmation for ${mutation.callId}`);
        }
        store.setInteraction(sessionId, {
          ...state.interaction,
          confirmation: { ...pending, approved: mutation.approved },
        });
        emitInteraction(sessionId);
        return;
      }
      case "interaction-confirm-approve-all": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        const pending = state.interaction.confirmation;
        if (pending && pending.approved === null) {
          store.setInteraction(sessionId, {
            ...state.interaction,
            confirmation: { ...pending, approved: true },
          });
          emitInteraction(sessionId);
        }
        return;
      }
      case "interaction-confirm-cancel-all": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        store.setInteraction(sessionId, {
          confirmation: null,
          question: null,
        });
        emitInteraction(sessionId);
        return;
      }
      case "interaction-question-request": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        if (state.interaction.question?.response === null) {
          return fail("question already pending");
        }
        store.setInteraction(sessionId, {
          ...state.interaction,
          question: { callId: mutation.callId, request: mutation.request, response: null },
        });
        emitInteraction(sessionId);
        return;
      }
      case "interaction-question-respond": {
        const sessionId = meta.currentSessionId;
        const state = sessionId ? store.load(sessionId) : null;
        if (!sessionId || !state) return fail("no active session");
        const pending = state.interaction.question;
        if (!pending || pending.callId !== mutation.callId) {
          return fail(`no pending question for ${mutation.callId}`);
        }
        store.setInteraction(sessionId, {
          ...state.interaction,
          question: { ...pending, response: mutation.response },
        });
        emitInteraction(sessionId);
        return;
      }
    }
  };
}
