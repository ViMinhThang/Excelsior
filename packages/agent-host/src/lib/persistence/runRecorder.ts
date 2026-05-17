import { AnyAgentEvent, makeEvent } from "../runtime/events.js";
import { TURN_COMPLETE } from "../runtime/eventNames.js";
import {
  appendEvent,
  deleteAllSessionsEvents,
  deleteSessionEvents,
  dropLastCompletedTurn,
  getLastCompletedTurn,
  loadRawSessionEvents,
  loadSessionEvents,
  type DropLastCompletedTurnResult,
  type LastCompletedTurn,
} from "./jsonlEventStore.js";

export interface RunRecorder {
  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void>;
  recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void>;
  loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult>;
  deleteSessionEvents(sessionId: string): Promise<void>;
  deleteAllSessionEvents(): Promise<void>;
}

export class JsonlRunRecorder implements RunRecorder {
  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void> {
    return appendEvent(sessionId, event);
  }

  recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void> {
    const checkpoint = makeEvent(runId, TURN_COMPLETE, { runId }, sequence);
    return appendEvent(sessionId, checkpoint as AnyAgentEvent);
  }

  loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return loadSessionEvents(sessionId);
  }

  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return loadRawSessionEvents(sessionId);
  }

  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null> {
    return getLastCompletedTurn(sessionId);
  }

  dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult> {
    return dropLastCompletedTurn(sessionId, expectedRunId);
  }

  deleteSessionEvents(sessionId: string): Promise<void> {
    return deleteSessionEvents(sessionId);
  }

  deleteAllSessionEvents(): Promise<void> {
    return deleteAllSessionsEvents();
  }
}

export const defaultRunRecorder = new JsonlRunRecorder();
