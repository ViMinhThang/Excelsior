// Invariant: All functions in this module are deterministic and side-effect free.
//   They produce the same output for the same input.
//   mergeEvents deduplicates by event id (live wins over persisted).

import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock } from "./display.js";
import { projectEventsToAIHistory } from "./projectHistory.js";
import { groupEventsForDisplay } from "./projectEvents.js";

import type { AgentMessage } from "@excelsior/core";

export interface ChildRun {
  getSnapshot(): readonly AnyAgentEvent[];
}

export interface ProjectionInput {
  liveEvents: readonly AnyAgentEvent[];
  persistedEvents: AnyAgentEvent[];
  childRuns: Map<string, ChildRun>;
}

function sortRunEvents(events: readonly AnyAgentEvent[]): AnyAgentEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence);
}

function getPersistedChildEvents(
  events: readonly AnyAgentEvent[],
): Map<string, AnyAgentEvent[]> {
  const childEvents = new Map<string, AnyAgentEvent[]>();

  for (const event of events) {
    if (!event.parentEventId) continue;
    const existing = childEvents.get(event.runId) ?? [];
    existing.push(event);
    childEvents.set(event.runId, existing);
  }

  for (const [runId, runEvents] of childEvents) {
    childEvents.set(runId, sortRunEvents(runEvents));
  }

  return childEvents;
}

export function mergeEvents(input: ProjectionInput): AnyAgentEvent[] {
  const { liveEvents, persistedEvents } = input;
  if (liveEvents.length === 0)
    return persistedEvents.filter((e) => !e.parentEventId);
  const liveIds = new Set(liveEvents.map((e) => e.id));
  const filtered = persistedEvents.filter(
    (e) => !liveIds.has(e.id) && !e.parentEventId,
  );
  const filteredLive = liveEvents.filter((e) => !e.parentEventId);
  return [...filtered, ...filteredLive];
}

export function computeDisplayBlocks(input: ProjectionInput): ProjectedBlock[] {
  const displayEvents = mergeEvents(input);
  const persistedChildEvents = getPersistedChildEvents(input.persistedEvents);
  return groupEventsForDisplay(displayEvents, {
    getChildEvents: (childRunId: string) => {
      const child = input.childRuns.get(childRunId);
      if (child) {
        const snapshot = child.getSnapshot();
        if (snapshot.length > 0) return snapshot;
      }
      return persistedChildEvents.get(childRunId) ?? [];
    },
  });
}

export function buildAIHistory(
  input: ProjectionInput,
): AgentMessage[] {
  const events =
    input.liveEvents.length > 0 ? input.liveEvents : input.persistedEvents;
  return projectEventsToAIHistory(events.filter((e) => !e.parentEventId));
}
