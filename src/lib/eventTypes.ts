import { ToolCallInfo } from "../types.js";

export interface Session {
  id: string;
  startedAt: string;
  updatedAt: string;
  metadata: { userInput: string };
}

export type AgentEventType =
  | "session-start"
  | "user-input"
  | "text-delta"
  | "tool-call-start"
  | "tool-call-end"
  | "sub-agent-spawned"
  | "sub-agent-output"
  | "sub-agent-done"
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

export type ToolCallStatus = "pending" | "completed" | "error";

export type DisplayBlock =
  | { type: "user"; id: string; content: string; timestamp: string }
  | { type: "assistant"; id: string; content: string; timestamp: string }
  | { type: "tool-call"; id: string; toolName: string; toolArgs: string; status: ToolCallStatus; content: string; timestamp: string }
  | { type: "sub-agent"; id: string; role: string; state: SubAgentDisplayState; timestamp: string };

export interface SubAgentDisplayState {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentPart[];
  startTime?: number;
  endTime?: number;
}

export type SubAgentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; toolArgs: string; toolCallId: string; status: "pending" | "completed" | "error" };

// Backward-compatible aliases for review screen
export type SubAgentOutputPart = SubAgentPart;

export interface SubAgentState {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  outputParts: SubAgentPart[];
  toolCalls: ToolCallInfo[];
  startTime?: number;
  endTime?: number;
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
