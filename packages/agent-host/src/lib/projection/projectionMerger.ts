// Invariant: All functions in this module are deterministic and side-effect free.
//   They produce the same output for the same input.
//   mergeEvents deduplicates by event id (live wins over persisted).

import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock } from "./display.js";
import { projectEventsToAIMessages } from "./aiHistoryProjection.js";
import { projectEventsToDisplayBlocks } from "./chatTranscriptProjection.js";

import type { AgentMessage } from "@excelsior/core";

export interface ChildRun {
  getSnapshot(): readonly AnyAgentEvent[];
}

export interface ProjectionInput {
  liveEvents: readonly AnyAgentEvent[];
  persistedEvents: AnyAgentEvent[];
  childRuns: Map<string, ChildRun>;
}

function sortEventsByRunSequence(
  events: readonly AnyAgentEvent[],
): AnyAgentEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence);
}

function isParentRunEvent(event: AnyAgentEvent): boolean {
  return !event.parentEventId;
}

function indexPersistedChildEventsByRunId(
  events: readonly AnyAgentEvent[],
): Map<string, AnyAgentEvent[]> {
  const childEventsByRunId = new Map<string, AnyAgentEvent[]>();

  for (const event of events) {
    if (!event.parentEventId) continue;
    const existing = childEventsByRunId.get(event.runId) ?? [];
    existing.push(event);
    childEventsByRunId.set(event.runId, existing);
  }

  for (const [runId, runEvents] of childEventsByRunId) {
    childEventsByRunId.set(runId, sortEventsByRunSequence(runEvents));
  }

  return childEventsByRunId;
}

function selectPersistedParentEventsNotLive(
  persistedEvents: readonly AnyAgentEvent[],
  liveEvents: readonly AnyAgentEvent[],
): AnyAgentEvent[] {
  const liveIds = new Set(liveEvents.map((event) => event.id));
  return persistedEvents.filter(
    (event) => !liveIds.has(event.id) && isParentRunEvent(event),
  );
}

function selectLiveParentEvents(
  liveEvents: readonly AnyAgentEvent[],
): AnyAgentEvent[] {
  return liveEvents.filter(isParentRunEvent);
}

function selectParentDisplayEvents(input: ProjectionInput): AnyAgentEvent[] {
  const { liveEvents, persistedEvents } = input;
  if (liveEvents.length === 0) {
    return persistedEvents.filter(isParentRunEvent);
  }

  return [
    ...selectPersistedParentEventsNotLive(persistedEvents, liveEvents),
    ...selectLiveParentEvents(liveEvents),
  ];
}

function createChildEventResolver(
  input: ProjectionInput,
  persistedChildEventsByRunId: Map<string, AnyAgentEvent[]>,
): (childRunId: string) => readonly AnyAgentEvent[] {
  return (childRunId: string) => {
    const child = input.childRuns.get(childRunId);
    if (child) {
      const snapshot = child.getSnapshot();
      if (snapshot.length > 0) return snapshot;
    }

    return persistedChildEventsByRunId.get(childRunId) ?? [];
  };
}

function selectAIHistoryEvents(input: ProjectionInput): AnyAgentEvent[] {
  const events =
    input.liveEvents.length > 0 ? input.liveEvents : input.persistedEvents;
  return events.filter(isParentRunEvent);
}

export function mergeEvents(input: ProjectionInput): AnyAgentEvent[] {
  return selectParentDisplayEvents(input);
}

export function computeDisplayBlocks(input: ProjectionInput): ProjectedBlock[] {
  const displayEvents = selectParentDisplayEvents(input);
  const persistedChildEventsByRunId = indexPersistedChildEventsByRunId(
    input.persistedEvents,
  );

  return projectEventsToDisplayBlocks(displayEvents, {
    getChildEvents: createChildEventResolver(input, persistedChildEventsByRunId),
  });
}

export function buildAIHistory(input: ProjectionInput): AgentMessage[] {
  return projectEventsToAIMessages(selectAIHistoryEvents(input));
}
