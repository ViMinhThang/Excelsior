import type { AnyRunEvent, RunEvent, RunEventOverrides } from "@excelsior/run-runtime";
import { makeRunEvent } from "@excelsior/run-runtime";
import type { AgentMessage } from "@excelsior/core";
import {
  RUN_START,
  RUN_END,
  CHILD_RUN_ATTACHED,
  PERSISTENCE_ERROR,
  TURN_COMPLETE,
  HISTORY_COMPACTED,
} from "./eventNames.js";

export const EVENT_SCHEMA_VERSION = 1;

export type AgentEventDataMap = {
  [RUN_START]: Record<string, never>;
  [RUN_END]: { cancelled: boolean };
  [TURN_COMPLETE]: { runId: string };
  [HISTORY_COMPACTED]: {
    summary: string;
    compactedEventCount: number;
    triggerMode: "manual" | "auto";
  };
  [CHILD_RUN_ATTACHED]: {
    childRunId: string;
    parentToolCallId: string;
    role: string;
  };
  "user-input": { content: string };
  "text-delta": { delta: string };
  "tool-call-start": { toolName: string; toolArgs: string; toolCallId: string };
  "tool-call-end": {
    toolCallId: string;
    result: string;
    status: string;
    toolName: string;
    toolArgs: string;
  };
  error: { message: string };
  [PERSISTENCE_ERROR]: {
    message: string;
    failedEventType: string;
  };
};

export type AgentEventType = keyof AgentEventDataMap;

export type AgentEvent<T extends AgentEventType = AgentEventType> = RunEvent<T, AgentEventDataMap[T]>;

export type AnyAgentEvent = AnyRunEvent<AgentEventDataMap>;

export function makeEvent<T extends AgentEventType>(
  runId: string,
  type: T,
  data: AgentEventDataMap[T],
  sequence: number,
  overrides?: {
    parentEventId?: string;
    relatedToolCallId?: string;
    causationId?: string;
    correlationId?: string;
  },
): AgentEvent<T> {
  return makeRunEvent<AgentEventDataMap, T>(runId, type, data, sequence, {
    eventVersion: EVENT_SCHEMA_VERSION,
    ...overrides,
  });
}

export type AgentEventEmitter = <T extends AgentEventType>(
  type: T,
  data: AgentEventDataMap[T],
  overrides?: RunEventOverrides,
) => void;

export interface StreamCapableAgent {
  stream(input: {
    messages: AgentMessage[];
    signal: AbortSignal;
    emit: AgentEventEmitter;
  }): Promise<void>;
}
