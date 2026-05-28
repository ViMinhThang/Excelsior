import {
  makeEvent as makeRuntimeEvent,
  type AgentEvent,
  type AgentEventDataMap,
  type AgentEventType,
  type AnyAgentEvent,
} from "@excelsior/agent-host/testing/runtime";

interface TestEventInput<T extends AgentEventType> {
  type: T;
  data: AgentEventDataMap[T];
  id?: string;
  runId?: string;
  sequence?: number;
  causationId?: string;
  correlationId?: string;
  parentEventId?: string;
  relatedToolCallId?: string;
  timestamp?: string;
}

export function makeEvent<T extends AgentEventType>(
  input: TestEventInput<T>,
): AgentEvent<T> {
  const runId = input.runId ?? "run_test";
  const event = makeRuntimeEvent(
    runId,
    input.type,
    input.data,
    input.sequence ?? 0,
    {
      causationId: input.causationId,
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      relatedToolCallId: input.relatedToolCallId,
    },
  );

  return {
    ...event,
    id: input.id ?? event.id,
    timestamp: input.timestamp ?? event.timestamp,
  };
}

export function makeChildRun(events: readonly AnyAgentEvent[]) {
  return {
    getSnapshot: () => events,
  };
}
