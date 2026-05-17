import { defaultRunRecorder } from "../../lib/persistence/runRecorder.js";
import type { AnyAgentEvent } from "../../lib/runtime/events.js";
import type {
  DropLastCompletedTurnResult,
  LastCompletedTurn,
} from "../../lib/persistence/jsonlEventStore.js";

export interface SessionHistoryStore {
  loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult>;
}

export const defaultSessionHistoryStore: SessionHistoryStore = {
  loadCompletedEvents: (sessionId) =>
    defaultRunRecorder.loadCompletedEvents(sessionId),
  getLastCompletedTurn: (sessionId) =>
    defaultRunRecorder.getLastCompletedTurn(sessionId),
  dropLastCompletedTurn: (sessionId, expectedRunId) =>
    defaultRunRecorder.dropLastCompletedTurn(sessionId, expectedRunId),
};
