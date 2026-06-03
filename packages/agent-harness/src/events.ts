import { randomUUID } from "node:crypto";
import type { AskQuestionRequest, AskQuestionResponse, ConfirmRequest, ConfirmResponse } from "@excelsior/core";

export const AGENT_START = "agent_start";
export const AGENT_END = "agent_end";
export const TURN_START = "turn_start";
export const TURN_END = "turn_end";
export const MESSAGE_START = "message_start";
export const MESSAGE_UPDATE = "message_update";
export const MESSAGE_END = "message_end";
export const TOOL_EXECUTION_START = "tool_execution_start";
export const TOOL_EXECUTION_UPDATE = "tool_execution_update";
export const TOOL_EXECUTION_END = "tool_execution_end";
export const CONFIRMATION_REQUESTED = "confirmation_requested";
export const CONFIRMATION_ANSWERED = "confirmation_answered";
export const QUESTION_REQUESTED = "question_requested";
export const QUESTION_ANSWERED = "question_answered";
export const HISTORY_COMPACTED = "history_compacted";
export const SESSION_CHANGED = "session_changed";
export const ERROR = "error";

export interface HarnessMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  modelContent?: string;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
  isError?: boolean;
}

export type HarnessEventDataMap = {
  [AGENT_START]: Record<string, never>;
  [AGENT_END]: { cancelled: boolean };
  [TURN_START]: Record<string, never>;
  [TURN_END]: { cancelled: boolean };
  [MESSAGE_START]: { message: HarnessMessage };
  [MESSAGE_UPDATE]: {
    messageId: string;
    role: "assistant";
    delta: string;
    content: string;
  };
  [MESSAGE_END]: { message: HarnessMessage };
  [TOOL_EXECUTION_START]: {
    toolCallId: string;
    toolName: string;
    toolArgs: string;
  };
  [TOOL_EXECUTION_UPDATE]: {
    toolCallId: string;
    toolName: string;
    delta: string;
  };
  [TOOL_EXECUTION_END]: {
    toolCallId: string;
    toolName: string;
    toolArgs: string;
    result: string;
    isError: boolean;
  };
  [CONFIRMATION_REQUESTED]: { request: ConfirmRequest };
  [CONFIRMATION_ANSWERED]: { response: ConfirmResponse };
  [QUESTION_REQUESTED]: { request: AskQuestionRequest };
  [QUESTION_ANSWERED]: { response: AskQuestionResponse };
  [HISTORY_COMPACTED]: {
    summary: string;
    compactedEventCount: number;
    triggerMode: "manual" | "auto";
  };
  [SESSION_CHANGED]: {
    sessionId: string | null;
    reason: "created" | "switched" | "deleted" | "renamed" | "reset";
  };
  [ERROR]: { message: string };
};

export type HarnessEventType = keyof HarnessEventDataMap;

export interface HarnessEvent<T extends HarnessEventType = HarnessEventType> {
  id: string;
  version: 1;
  workspaceId: string;
  sessionId: string;
  runId: string;
  turnId?: string;
  sequence: number;
  type: T;
  timestamp: string;
  data: HarnessEventDataMap[T];
  parentEventId?: string;
  relatedToolCallId?: string;
}

export type AnyHarnessEvent = {
  [T in HarnessEventType]: HarnessEvent<T>;
}[HarnessEventType];

export type HarnessEventEmitter = <T extends HarnessEventType>(
  type: T,
  data: HarnessEventDataMap[T],
  options?: {
    turnId?: string;
    relatedToolCallId?: string;
    parentEventId?: string;
  },
) => HarnessEvent<T>;

export function makeHarnessEvent<T extends HarnessEventType>(input: {
  workspaceId: string;
  sessionId: string;
  runId: string;
  turnId?: string;
  sequence: number;
  type: T;
  data: HarnessEventDataMap[T];
  relatedToolCallId?: string;
  parentEventId?: string;
}): HarnessEvent<T> {
  return {
    id: `evt_${randomUUID()}`,
    version: 1,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    runId: input.runId,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    sequence: input.sequence,
    type: input.type,
    timestamp: new Date().toISOString(),
    data: input.data,
    ...(input.parentEventId ? { parentEventId: input.parentEventId } : {}),
    ...(input.relatedToolCallId ? { relatedToolCallId: input.relatedToolCallId } : {}),
  };
}
