import type {
  DeltaScope,
  MetaSnapshot,
  RunSnapshot,
  SessionSnapshot,
  SnapshotPayload,
  RunToolState,
} from "@excelsior/protocol";
import { DiffEmitter } from "./diffEmitter.js";
import type { MetaState } from "./mutate.js";
import { RunStore } from "./runStore.js";
import { SessionStore } from "./sessionStore.js";

export interface SyncService {
  sync(scope: DeltaScope, cursor: number | null): { rev: number };
}

interface SyncDeps {
  emitter: DiffEmitter;
  store: SessionStore;
  runStore: RunStore;
  meta: MetaState;
}

export function createSyncService({ emitter, store, runStore, meta }: SyncDeps): SyncService {
  const buildSnapshot = (scope: DeltaScope): SnapshotPayload | null => {
    switch (scope.kind) {
      case "meta": {
        const snapshot: MetaSnapshot = {
          sessions: store.list(),
          currentSessionId: meta.currentSessionId,
          workspace: meta.workspace,
          llm: meta.llm,
          mode: meta.mode,
        };
        return snapshot;
      }
      case "session": {
        const state = store.load(scope.sessionId);
        const snapshot: SessionSnapshot = { session: state };
        return snapshot;
      }
      case "run": {
        const turn = runStore.activeTurn;
        if (!turn || turn.sessionId !== scope.sessionId) return null;
        const tools = turn.steps.flatMap((step) => step.toolCalls);
        const toolsState: RunToolState[] = tools.map((call) => ({
          id: call.id,
          toolName: call.toolName,
          args: call.args,
          status: call.status,
          result: call.result,
          isError: call.isError,
        }));
        const snapshot: RunSnapshot = {
          status: turn.status,
          turnId: turn.id,
          text: turn.blocks
            .filter((block) => block.kind === "assistant")
            .map((block) => block.content)
            .join(""),
          tools: toolsState,
        };
        return snapshot;
      }
    }
  };

  return {
    sync(scope, cursor) {
      let rev = emitter.lastRev(scope);
      const caughtUp = cursor !== null && cursor === rev;
      if (!caughtUp) {
        const snapshot = buildSnapshot(scope);
        if (snapshot) {
          emitter.emit(
            scope,
            { scope, delta: { kind: "snapshot", snapshot } },
          );
          rev = emitter.lastRev(scope);
        }
      }
      return { rev };
    },
  };
}
