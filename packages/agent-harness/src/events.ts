import { randomUUID } from "node:crypto";

export const RUN_START = "run-start";
export const RUN_END = "run-end";
export const USER_INPUT = "user-input";
export const TEXT_DELTA = "text-delta";
export const TOOL_CALL_START = "tool-call-start";
export const TOOL_CALL_END = "tool-call-end";
export const ERROR = "error";
export const HISTORY_COMPACTED = "history-compacted";

export type HarnessEventDataMap = {
  [RUN_START]: Record<string, never>;
  [RUN_END]: { cancelled: boolean };
  [USER_INPUT]: { content: string };
  [TEXT_DELTA]: { delta: string };
  [TOOL_CALL_START]: { toolName: string; toolArgs: string; toolCallId: string };
  [TOOL_CALL_END]: {
    toolCallId: string;
    result: string;
    status: "success" | "error";
    toolName: string;
    toolArgs: string;
  };
  [ERROR]: { message: string };
  [HISTORY_COMPACTED]: {
    summary: string;
    compactedEventCount: number;
    triggerMode: "manual" | "auto";
  };
};

export type HarnessEventType = keyof HarnessEventDataMap;

export interface HarnessEvent<T extends HarnessEventType = HarnessEventType> {
  id: string;
  runId: string;
  sessionId: string;
  sequence: number;
  type: T;
  version: number;
  causationId: string;
  correlationId: string;
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
  options?: { relatedToolCallId?: string; parentEventId?: string },
) => HarnessEvent<T>;

export function makeHarnessEvent<T extends HarnessEventType>(input: {
  runId: string;
  sessionId: string;
  sequence: number;
  type: T;
  data: HarnessEventDataMap[T];
  relatedToolCallId?: string;
  parentEventId?: string;
}): HarnessEvent<T> {
  return {
    id: randomUUID(),
    runId: input.runId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    type: input.type,
    version: 1,
    causationId: input.relatedToolCallId ?? input.runId,
    correlationId: input.runId,
    timestamp: new Date().toISOString(),
    data: input.data,
    parentEventId: input.parentEventId,
    relatedToolCallId: input.relatedToolCallId,
  };
}
