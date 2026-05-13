import { randomUUID } from "crypto";

export const EVENT_SCHEMA_VERSION = 1;

export type AgentEventDataMap = {
  "session-start": Record<string, never>;
  "user-input": { content: string };
  "text-delta": { delta: string };
  "tool-call-start": { toolName: string; toolArgs: string; toolCallId: string };
  "tool-call-end": { toolCallId: string; result: string; status: string; toolName: string; toolArgs: string };
  "child-session-attached": { childSessionId: string; parentToolCallId: string; role: string };
  "error": { message: string };
  "session-end": { cancelled: boolean };
};

export type AgentEventType = keyof AgentEventDataMap;

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  id: string;
  sessionId: string;
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

export function generateEventId(): string {
  return `evt_${randomUUID()}`;
}

export function makeEvent<T extends AgentEventType>(
  sessionId: string,
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
    id: generateEventId(),
    sessionId,
    sequence,
    type,
    version: EVENT_SCHEMA_VERSION,
    causationId: overrides?.causationId ?? "",
    correlationId: overrides?.correlationId ?? sessionId,
    timestamp: new Date().toISOString(),
    data,
    ...(overrides?.parentEventId ? { parentEventId: overrides.parentEventId } : {}),
    ...(overrides?.relatedToolCallId ? { relatedToolCallId: overrides.relatedToolCallId } : {}),
  } as AgentEvent<T>;
}
