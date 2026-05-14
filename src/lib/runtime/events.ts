import { randomUUID } from "crypto";
import { RUN_START, RUN_END, CHILD_RUN_ATTACHED, TURN_COMPLETE } from "./event-names.js";

export const EVENT_SCHEMA_VERSION = 1;

export type AgentEventDataMap = {
  [RUN_START]: Record<string, never>;
  [RUN_END]: { cancelled: boolean };
  [TURN_COMPLETE]: { runId: string };
  [CHILD_RUN_ATTACHED]: { childRunId: string; parentToolCallId: string; role: string };
  "user-input": { content: string };
  "text-delta": { delta: string };
  "tool-call-start": { toolName: string; toolArgs: string; toolCallId: string };
  "tool-call-end": { toolCallId: string; result: string; status: string; toolName: string; toolArgs: string };
  "error": { message: string };
};

export type AgentEventType = keyof AgentEventDataMap;

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  id: string;
  runId: string;
  sequence: number;
  type: T;
  version: number;
  causationId: string;
  correlationId: string;
  timestamp: string;
  data: AgentEventDataMap[T];
  parentEventId?: string;
  relatedToolCallId?: string;
}

export type AnyAgentEvent = {
  [T in AgentEventType]: { type: T } & AgentEvent<T>;
}[AgentEventType];

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
  return {
    id: `evt_${randomUUID()}`,
    runId,
    sequence,
    type,
    version: EVENT_SCHEMA_VERSION,
    causationId: overrides?.causationId ?? "",
    correlationId: overrides?.correlationId ?? runId,
    timestamp: new Date().toISOString(),
    data,
    ...(overrides?.parentEventId ? { parentEventId: overrides.parentEventId } : {}),
    ...(overrides?.relatedToolCallId ? { relatedToolCallId: overrides.relatedToolCallId } : {}),
  } as AgentEvent<T>;
}
