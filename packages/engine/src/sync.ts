import type {
  DeltaScope,
  MetaSnapshot,
  RunItem,
  RunSnapshot,
  SessionSnapshot,
  SnapshotPayload,
} from "@excelsior/protocol";
import { DiffEmitter } from "./diffEmitter.js";
import type { MetaState } from "./mutate.js";
import { RunStore, toRunToolState } from "./runStore.js";
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
        const calls = turn.steps.flatMap((step) => step.toolCalls);
        const items: RunItem[] = turn.blocks.flatMap<RunItem>((block) => {
          if (block.kind === "assistant") {
            return [{ kind: "assistant", content: block.content }];
          }
          const call = calls.find((c) => c.id === block.id);
          if (!call) return [];
          return [{ kind: "tool-call", tool: toRunToolState(call) }];
        });
        const snapshot: RunSnapshot = { status: turn.status, turnId: turn.id, items };
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
