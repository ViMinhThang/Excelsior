import type { AnyHarnessEvent, HarnessEventType } from "../events.js";

export interface AssistantDraft {
  id: string;
  content: string;
  timestamp: string;
  frozen: boolean;
}

export interface ToolDraft {
  id: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "completed" | "error";
  result: string;
  timestamp: string;
  startTimestamp: string;
  endTimestamp?: string;
}

export interface ProjectionHandler {
  handles: ReadonlySet<HarnessEventType>;
  apply(event: AnyHarnessEvent, projection: ProjectionContext): void;
}

export interface ProjectionContext {
  messages: MessageProjectionActions;
  tools: ToolProjectionActions;
  reasoning: ReasoningProjectionActions;
  lifecycle: LifecycleProjectionActions;
  subAgents: SubAgentProjectionActions;
}

export interface MessageProjectionActions {
  startAssistant(input: { id: string; content: string; turnId?: string; timestamp: string }): void;
  updateAssistant(input: { id: string; delta: string; turnId?: string; timestamp: string }): void;
  finishUser(input: { message: import("../events.js").HarnessMessage; turnId?: string; timestamp: string }): void;
  finishAssistant(input: { message: import("../events.js").HarnessMessage; turnId?: string; timestamp: string }): void;
  finishToolMessage(input: { message: import("../events.js").HarnessMessage }): void;
}

export interface ToolProjectionActions {
  start(input: { id: string; toolName: string; toolArgs: string; turnId?: string; timestamp: string }): void;
  update(input: { id: string; delta: string; turnId?: string; timestamp: string }): void;
  finish(input: {
    id: string;
    toolCallId: string;
    toolName: string;
    toolArgs: string;
    result: string;
    isError: boolean;
    turnId?: string;
    timestamp: string;
  }): void;
}

export interface ReasoningProjectionActions {
  finish(input: { id: string; content: string; turnId?: string; timestamp: string }): void;
}

export interface LifecycleProjectionActions {
  startTurn(input: { turnId: string; timestamp: string }): void;
  endTurn(input: { turnId?: string; cancelled: boolean; timestamp: string }): void;
  compactHistory(input: { id: string; summary: string; turnId?: string; timestamp: string }): void;
  fail(input: { id: string; message: string; turnId?: string; timestamp: string }): void;
}

export interface SubAgentProjectionActions {
  apply(input: {
    id: string;
    event: Extract<AnyHarnessEvent, { type: "sub_agent_event" }>["data"]["event"];
    turnId?: string;
    timestamp: string;
  }): void;
}
