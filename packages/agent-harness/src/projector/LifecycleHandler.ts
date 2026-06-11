import {
  ERROR,
  HISTORY_COMPACTED,
  TURN_START,
  TURN_END,
  type AnyHarnessEvent,
  type HarnessEventType,
} from "../events.js";
import type { ProjectionHandler, ProjectionState } from "./types.js";
import {
  flushAll,
  ensureTurn,
  upsertBlockInTurn,
} from "./utils.js";
import type { ProjectedBlock } from "@excelsior/core";

export class LifecycleHandler implements ProjectionHandler {
  public handles = new Set<HarnessEventType>([
    HISTORY_COMPACTED,
    ERROR,
    TURN_START,
    TURN_END,
  ]);

  public apply(event: AnyHarnessEvent, state: ProjectionState): void {
    if (event.type === TURN_START) {
      flushAll(state, true, state.currentTurnId || undefined);
      const turnId = event.turnId || event.id;
      state.currentTurnId = turnId;
      const turn = ensureTurn(state, turnId, event.timestamp);
      turn.status = "in-progress";
      turn.startTime = event.timestamp || new Date().toISOString();
    } else if (event.type === TURN_END) {
      flushAll(state, true, event.turnId);
      const turnId = event.turnId || state.currentTurnId;
      if (turnId) {
        const turn = state.turns.find(t => t.id === turnId);
        if (turn) {
          turn.status = event.data.cancelled ? "interrupted" : "completed";
          turn.endTime = event.timestamp || new Date().toISOString();
        }
      }
      if (state.currentTurnId === turnId) {
        state.currentTurnId = null;
      }
    } else if (event.type === HISTORY_COMPACTED) {
      flushAll(state, true, event.turnId);
      const dividerBlock: ProjectedBlock = {
        type: "compaction-boundary",
        id: event.id,
        summary: event.data.summary,
        timestamp: event.timestamp || new Date().toISOString(),
      };
      
      // Compaction means preceding event history is cleared. Prune existing turns
      // and establish a new compaction baseline.
      state.turns = [];
      state.currentTurnId = null;
      const turn = ensureTurn(state, event.turnId, event.timestamp);
      turn.sawCompaction = true;
      turn.blocks.push(dividerBlock);
      turn.status = "completed";
    } else if (event.type === ERROR) {
      flushAll(state, true, event.turnId);
      const block: ProjectedBlock = {
        type: "assistant",
        id: event.id,
        content: `Error: ${event.data.message}`,
        timestamp: event.timestamp || new Date().toISOString(),
        isFrozen: true,
      };
      upsertBlockInTurn(state, event.turnId, block);
      state.aiHistory.push({ role: "assistant", content: `Error: ${event.data.message}` });
      
      const turnId = event.turnId || state.currentTurnId;
      if (turnId) {
        const turn = state.turns.find(t => t.id === turnId);
        if (turn) {
          turn.status = "failed";
          turn.error = { message: event.data.message };
        }
      }
    }
  }
}
