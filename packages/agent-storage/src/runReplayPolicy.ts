import type {
  AnyAgentEvent,
  DropLastCompletedTurnResult,
  LastCompletedTurn,
} from "./ports.js";
import {
  formatStorageTimestamp,
  systemStorageTimeIdPolicy,
} from "./timeIdPolicy.js";

export const TURN_COMPLETE = "turn-complete";

export interface CreateTurnCompleteEventOptions {
  createEventId?: () => string;
  now?: () => Date | string;
}

export function createTurnCompleteEvent(
  runId: string,
  sequence: number,
  options: CreateTurnCompleteEventOptions = {},
): AnyAgentEvent {
  return {
    id: options.createEventId?.() ?? systemStorageTimeIdPolicy.createId("evt_chk"),
    runId,
    sequence,
    type: TURN_COMPLETE,
    version: 1,
    causationId: "",
    correlationId: runId,
    timestamp: options.now
      ? formatStorageTimestamp(options.now())
      : systemStorageTimeIdPolicy.nowIso(),
    data: { runId },
  };
}

function timestampMs(event: AnyAgentEvent): number {
  const parsed = Date.parse(event.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortEventsForReplay(events: AnyAgentEvent[]): AnyAgentEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      if (a.event.runId === b.event.runId) {
        return a.event.sequence - b.event.sequence || a.index - b.index;
      }
      return timestampMs(a.event) - timestampMs(b.event) || a.index - b.index;
    })
    .map(({ event }) => event);
}

export function turnCompleteRunId(event: AnyAgentEvent): string | null {
  if (event.type !== TURN_COMPLETE) return null;
  return (event.data as { runId?: string }).runId ?? null;
}

export function belongsToCompletedRun(
  event: AnyAgentEvent,
  completedRunIds: Set<string>,
): boolean {
  const checkpointRunId = turnCompleteRunId(event);
  if (checkpointRunId) return completedRunIds.has(checkpointRunId);

  return (
    completedRunIds.has(event.runId) ||
    (!!event.parentEventId && completedRunIds.has(event.parentEventId)) ||
    (!!event.correlationId && completedRunIds.has(event.correlationId))
  );
}

export function belongsToRun(event: AnyAgentEvent, runId: string): boolean {
  const checkpointRunId = turnCompleteRunId(event);
  if (checkpointRunId) return checkpointRunId === runId;

  return (
    event.runId === runId ||
    event.parentEventId === runId ||
    event.correlationId === runId
  );
}

export function findLastCompletedTurn(
  events: AnyAgentEvent[],
): LastCompletedTurn | null {
  const checkpoint = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === TURN_COMPLETE)
    .at(-1);

  if (!checkpoint) return null;

  const runId = turnCompleteRunId(checkpoint.event);
  if (!runId) return null;

  return {
    runId,
    checkpointIndex: checkpoint.index,
    eventCount: events.filter((event) => belongsToRun(event, runId)).length,
  };
}

export function completedReplayEvents(events: AnyAgentEvent[]): AnyAgentEvent[] {
  const checkpoints = events.filter((event) => event.type === TURN_COMPLETE);

  if (checkpoints.length === 0) return sortEventsForReplay(events);

  const completedRunIds = new Set(
    checkpoints.map((event) => (event.data as { runId: string }).runId),
  );
  const completedEvents = events.filter((event) =>
    belongsToCompletedRun(event, completedRunIds),
  );

  return sortEventsForReplay(completedEvents);
}

export function dropLastCompletedTurnFromEvents(
  events: AnyAgentEvent[],
  expectedRunId?: string,
): DropLastCompletedTurnResult & { remainingEvents: AnyAgentEvent[] } {
  const latest = findLastCompletedTurn(events);

  if (!latest) {
    return {
      dropped: false,
      removedEvents: 0,
      reason: "no-completed-turn",
      remainingEvents: events,
    };
  }

  if (expectedRunId && latest.runId !== expectedRunId) {
    return {
      dropped: false,
      runId: latest.runId,
      removedEvents: 0,
      reason: "latest-turn-mismatch",
      remainingEvents: events,
    };
  }

  const remainingEvents = events.filter(
    (event) => !belongsToRun(event, latest.runId),
  );

  return {
    dropped: true,
    runId: latest.runId,
    removedEvents: events.length - remainingEvents.length,
    remainingEvents,
  };
}
