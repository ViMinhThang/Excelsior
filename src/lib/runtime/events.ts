export type AgentEventType =
  | "session-start"
  | "user-input"
  | "text-delta"
  | "tool-call-start"
  | "tool-call-end"
  | "child-session-attached"
  | "error"
  | "session-end";

export interface AgentEvent {
  id: string;
  sessionId: string;
  sequence: number;
  type: AgentEventType;
  timestamp: string;
  data: Record<string, unknown>;
  parentEventId?: string;
  relatedToolCallId?: string;
}

let _eventSeq = 0;
export function generateEventId(): string {
  return `evt_${Date.now()}_${(++_eventSeq).toString(36)}`;
}

export function makeEvent(
  sessionId: string,
  type: AgentEventType,
  data: Record<string, unknown>,
  sequence: number,
  overrides?: { parentEventId?: string; relatedToolCallId?: string },
): AgentEvent {
  return {
    id: generateEventId(),
    sessionId,
    sequence,
    type,
    timestamp: new Date().toISOString(),
    data,
    ...(overrides?.parentEventId ? { parentEventId: overrides.parentEventId } : {}),
    ...(overrides?.relatedToolCallId ? { relatedToolCallId: overrides.relatedToolCallId } : {}),
  };
}
