import type {
  AgentLlmInfo,
  AgentMode,
  AppSettings,
  AskQuestionRequest,
  AskQuestionResponse,
  ConfirmRequest,
  LiveBlock,
  SessionState,
  TranscriptBlock,
  Workspace,
} from "@excelsior/protocol";
import { DiffEmitter, emitMetaError } from "./diffEmitter.js";
import { latestStep, turnToTranscriptBlocks } from "./aiHistory.js";
import { RunStore, toRunToolState, type RunToolCall, type RunTurn } from "./runStore.js";
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

type MutateHandler<K extends Mutation["kind"]> = (
  mutation: Mutation & { kind: K },
) => void;

export function createMutate({ store, emitter, runStore, meta }: MutateDeps): Mutate {
  const sessionScope = (sessionId: string) => ({ kind: "session", sessionId }) as const;
  const runScope = (sessionId: string) => ({ kind: "run", sessionId }) as const;

  const fail = (message: string): void => {
    emitMetaError(emitter, message);
  };

  const emitMetaChanged = (): void => {
    emitter.emit(
      { kind: "meta" },
      { scope: { kind: "meta" }, delta: { kind: "meta-changed" } },
    );
  };

  const emitSessionState = (state: SessionState): void => {
    emitter.emit(
      sessionScope(state.session.id),
      { scope: sessionScope(state.session.id), delta: { kind: "session-state", session: state } },
    );
  };

  const emitBlockCommitted = (sessionId: string, blocks: TranscriptBlock[]): void => {
    for (const block of blocks) {
      emitter.emit(
        sessionScope(sessionId),
        { scope: sessionScope(sessionId), delta: { kind: "block-committed", block } },
      );
    }
  };

  const emitRunStatus = (
    sessionId: string,
    status: "running" | "committed" | "cancelled" | "failed",
    turnId: string,
  ): void => {
    emitter.emit(
      runScope(sessionId),
      { scope: runScope(sessionId), delta: { kind: "run-status", status, turnId } },
    );
  };

  const emitRunTool = (sessionId: string, call: RunToolCall): void => {
    emitter.emit(
      runScope(sessionId),
      { scope: runScope(sessionId), delta: { kind: "run-tool", tool: toRunToolState(call) } },
    );
  };

  const commitTurn = (turn: RunTurn, runStatus: "committed" | "cancelled" | "failed"): void => {
    turn.status = runStatus;
    const blocks = turnToTranscriptBlocks(turn, false);
    if (blocks.length > 0) {
      store.appendBlocks(turn.sessionId, blocks);
      emitBlockCommitted(turn.sessionId, blocks);
    }
    store.checkpoint(turn.sessionId);
    runStore.clear();
    emitRunStatus(turn.sessionId, runStatus, turn.id);
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

  const requireSession = (sessionId: string): boolean => {
    if (store.load(sessionId)) return true;
    fail(`unknown session ${sessionId}`);
    return false;
  };

  const requireActiveTurn = (turnId: string): RunTurn | null => {
    const turn = runStore.activeTurn;
    if (turn && turn.id === turnId) return turn;
    fail(`no active run for turn ${turnId}`);
    return null;
  };

  const requireCurrentSession = (): { sessionId: string; state: SessionState } | null => {
    const sessionId = meta.currentSessionId;
    const state = sessionId ? store.load(sessionId) : null;
    if (!sessionId || !state) {
      fail("no active session");
      return null;
    }
    return { sessionId, state };
  };

  const handlers: { [K in Mutation["kind"]]: MutateHandler<K> } = {
    "session-create": (mutation) => {
      const state = store.create(mutation.title ?? "New Session");
      meta.currentSessionId = state.session.id;
      emitSessionState(state);
      emitMetaChanged();
    },
    "session-switch": (mutation) => {
      if (!requireSession(mutation.sessionId)) return;
      meta.currentSessionId = mutation.sessionId;
      const state = store.load(mutation.sessionId);
      if (state) emitSessionState(state);
      emitMetaChanged();
    },
    "session-delete": (mutation) => {
      if (!requireSession(mutation.sessionId)) return;
      store.delete(mutation.sessionId);
      if (meta.currentSessionId === mutation.sessionId) {
        meta.currentSessionId = null;
      }
      emitMetaChanged();
    },
    "session-rename": (mutation) => {
      if (!requireSession(mutation.sessionId)) return;
      store.rename(mutation.sessionId, mutation.title);
      emitMetaChanged();
    },
    "session-clear": (mutation) => {
      if (!requireSession(mutation.sessionId)) return;
      store.clear(mutation.sessionId);
      const state = store.load(mutation.sessionId)!;
      emitSessionState(state);
    },
    "blocks-commit": (mutation) => {
      if (!requireSession(mutation.sessionId)) return;
      store.appendBlocks(mutation.sessionId, mutation.blocks);
      emitBlockCommitted(mutation.sessionId, mutation.blocks);
    },
    "mode-set": (mutation) => {
      meta.mode = mutation.mode;
      emitMetaChanged();
    },
    "settings-save": (mutation) => {
      meta.settings = { ...meta.settings, ...mutation.patch };
      emitMetaChanged();
    },
    "meta-refresh": () => {
      emitMetaChanged();
    },
    "run-begin": (mutation) => {
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
      const userBlock: TranscriptBlock = {
        id: `user_${mutation.turn.id}`,
        turnId: mutation.turn.id,
        kind: "user",
        role: "user",
        content: mutation.turn.userContent,
        status: "completed",
        createdAt: mutation.turn.startedAt,
        finalizedAt: mutation.turn.startedAt,
      };
      store.appendBlocks(mutation.turn.sessionId, [userBlock]);
      emitBlockCommitted(mutation.turn.sessionId, [userBlock]);

      runStore.begin(mutation.turn);
      emitRunStatus(mutation.turn.sessionId, "running", mutation.turn.id);
    },
    "run-text": (mutation) => {
      const turn = requireActiveTurn(mutation.turnId);
      if (!turn) return;
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
    },
    "run-tool-start": (mutation) => {
      const turn = requireActiveTurn(mutation.turnId);
      if (!turn) return;
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
      emitRunTool(turn.sessionId, mutation.call);
    },
    "run-tool-update": (mutation) => {
      const turn = runStore.activeTurn;
      const call = turn ? findCall(mutation.callId) : undefined;
      if (!turn || !call) return fail(`unknown tool call ${mutation.callId}`);
      call.result = (call.result ?? "") + mutation.result;
      const block = turn.blocks.find((b) => b.id === mutation.callId);
      if (block?.tool) block.tool.result = call.result;
      emitRunTool(turn.sessionId, call);
    },
    "run-tool-end": (mutation) => {
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
      emitRunTool(turn.sessionId, call);
    },
    "run-commit": (mutation) => {
      const turn = requireActiveTurn(mutation.turnId);
      if (!turn) return;
      if (turn.status !== "running") return fail("run is not running");
      commitTurn(turn, "committed");
    },
    "run-cancel": (mutation) => {
      const turn = requireActiveTurn(mutation.turnId);
      if (!turn) return;
      commitTurn(turn, "cancelled");
    },
    "run-fail": (mutation) => {
      const turn = requireActiveTurn(mutation.turnId);
      if (!turn) return;
      turn.error = mutation.error;
      commitTurn(turn, "failed");
      emitMetaError(emitter, mutation.error);
    },
    "interaction-confirm-request": (mutation) => {
      const current = requireCurrentSession();
      if (!current) return;
      if (current.state.interaction.confirmation?.approved === null) {
        return fail("confirmation already pending");
      }
      store.setInteraction(current.sessionId, {
        ...current.state.interaction,
        confirmation: { callId: mutation.callId, request: mutation.request, approved: null },
      });
      emitInteraction(current.sessionId);
    },
    "interaction-confirm-respond": (mutation) => {
      const current = requireCurrentSession();
      if (!current) return;
      const pending = current.state.interaction.confirmation;
      if (!pending || pending.callId !== mutation.callId) {
        return fail(`no pending confirmation for ${mutation.callId}`);
      }
      store.setInteraction(current.sessionId, {
        ...current.state.interaction,
        confirmation: { ...pending, approved: mutation.approved },
      });
      emitInteraction(current.sessionId);
    },
    "interaction-confirm-approve-all": () => {
      const current = requireCurrentSession();
      if (!current) return;
      const pending = current.state.interaction.confirmation;
      if (pending && pending.approved === null) {
        store.setInteraction(current.sessionId, {
          ...current.state.interaction,
          confirmation: { ...pending, approved: true },
        });
        emitInteraction(current.sessionId);
      }
    },
    "interaction-confirm-cancel-all": () => {
      const current = requireCurrentSession();
      if (!current) return;
      store.setInteraction(current.sessionId, {
        confirmation: null,
        question: null,
      });
      emitInteraction(current.sessionId);
    },
    "interaction-question-request": (mutation) => {
      const current = requireCurrentSession();
      if (!current) return;
      if (current.state.interaction.question?.response === null) {
        return fail("question already pending");
      }
      store.setInteraction(current.sessionId, {
        ...current.state.interaction,
        question: { callId: mutation.callId, request: mutation.request, response: null },
      });
      emitInteraction(current.sessionId);
    },
    "interaction-question-respond": (mutation) => {
      const current = requireCurrentSession();
      if (!current) return;
      const pending = current.state.interaction.question;
      if (!pending || pending.callId !== mutation.callId) {
        return fail(`no pending question for ${mutation.callId}`);
      }
      store.setInteraction(current.sessionId, {
        ...current.state.interaction,
        question: { ...pending, response: mutation.response },
      });
      emitInteraction(current.sessionId);
    },
  };

  return (mutation) => {
    const handler = handlers[mutation.kind] as MutateHandler<Mutation["kind"]>;
    handler(mutation);
  };
}