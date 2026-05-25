import type { AgentMessage } from "@excelsior/core";
import type { AnyAgentEvent } from "../../lib/runtime/events.js";
import { projectEventsToAIMessages } from "../../lib/projection/aiHistoryProjection.js";
import { projectEventsToDisplayBlocks } from "../../lib/projection/chatTranscriptProjection.js";
import type { ProjectedBlock } from "../../lib/projection/display.js";
import type { ProjectionInputState } from "../types.js";

export interface ProjectionResult {
  displayBlocks: ProjectedBlock[];
  aiHistory: AgentMessage[];
}

export class ProjectionPolicy {
  project(input: ProjectionInputState): ProjectionResult {
    return {
      displayBlocks: this.computeDisplayBlocks(input),
      aiHistory: this.buildAIHistory(input),
    };
  }

  private computeDisplayBlocks(input: ProjectionInputState): ProjectedBlock[] {
    const displayEvents = selectParentDisplayEvents(input);
    const persistedChildEventsByRunId = indexPersistedChildEventsByRunId(
      input.persistedEvents,
    );

    return projectEventsToDisplayBlocks(displayEvents, {
      getChildEvents: createChildEventResolver(
        input,
        persistedChildEventsByRunId,
      ),
    });
  }

  private buildAIHistory(input: ProjectionInputState): AgentMessage[] {
    return projectEventsToAIMessages(selectAIHistoryEvents(input));
  }
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

function selectParentDisplayEvents(input: ProjectionInputState): AnyAgentEvent[] {
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
  input: ProjectionInputState,
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

function selectAIHistoryEvents(input: ProjectionInputState): AnyAgentEvent[] {
  const events =
    input.liveEvents.length > 0 ? input.liveEvents : input.persistedEvents;
  return events.filter(isParentRunEvent);
}
