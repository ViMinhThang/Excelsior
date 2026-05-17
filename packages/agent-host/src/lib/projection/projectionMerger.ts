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
  //if an event dont have a parentEventId mean that it a parentEvent(no event own it)
  // so we return true if it not a parent event
  return !event.parentEventId;
}

function indexPersistedChildEventsByRunId(
  events: readonly AnyAgentEvent[],
): Map<string, AnyAgentEvent[]> {
  // a map because a parent event have a lot of child event
  const childEventsByRunId = new Map<string, AnyAgentEvent[]>();

  for (const event of events) {
    // if it is a parent event (it don't have a parent) then skip
    if (!event.parentEventId) continue;
    // check if the child event id doesnt exist in the map we create a new array
    const existing = childEventsByRunId.get(event.runId) ?? [];
    // push the event to the array
    existing.push(event);
    // initilize the map <id,[existing]>
    childEventsByRunId.set(event.runId, existing);
  }

  for (const [runId, runEvents] of childEventsByRunId) {
    // make sure we sort the event by chronological
    childEventsByRunId.set(runId, sortEventsByRunSequence(runEvents));
  }

  return childEventsByRunId;
}

function selectPersistedParentEventsNotLive(
  persistedEvents: readonly AnyAgentEvent[],
  liveEvents: readonly AnyAgentEvent[],
): AnyAgentEvent[] {
  const liveIds = new Set(liveEvents.map((event) => event.id));
  //filter out the live event by the live event Id and make sure that we only take the parent event
  // if live Id has the event return true and then use ! to get it to return false
  // basically we do this to failed the filter of an item if live id have the event
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
  // For a split second the event will be save to persistence and exist in live memory so we need hard filter
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
  // get all the event from persistence and live memory (only parent event)
  const displayEvents = selectParentDisplayEvents(input);
  // get a map cotain the key is the child event Id and the value is an array of event sorted in chronological
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

export function buildAIHistory(input: ProjectionInput): AgentMessage[] {
  return projectEventsToAIMessages(selectAIHistoryEvents(input));
}
