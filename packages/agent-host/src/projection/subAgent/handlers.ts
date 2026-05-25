import type { AnyAgentEvent } from "../../runtime/events.js";
import {
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
} from "../../runtime/eventNames.js";
import type { SubAgentProjectionPart } from "../display.js";
import type {
  SubAgentProjectionEvent,
  SubAgentProjectionState,
  SubAgentToolStatus,
} from "./state.js";

function rememberTimestamp(
  state: SubAgentProjectionState,
  event: AnyAgentEvent,
): SubAgentProjectionState {
  return {
    ...state,
    firstTimestamp: state.firstTimestamp ?? event.timestamp,
    lastTimestamp: event.timestamp,
  };
}

function appendTextPart(
  parts: readonly SubAgentProjectionPart[],
  text: string,
): SubAgentProjectionPart[] {
  const last = parts[parts.length - 1];
  if (last?.type === "text") {
    return [...parts.slice(0, -1), { type: "text", text: last.text + text }];
  }

  return [...parts, { type: "text", text }];
}

function updateToolCallStatus(
  state: SubAgentProjectionState,
  callId: string,
  status: SubAgentToolStatus,
): SubAgentProjectionState {
  return {
    ...state,
    parts: state.parts.map((part) => {
      if (part.type !== "tool-call" || part.toolCallId !== callId) return part;
      return { ...part, status };
    }),
    toolCalls: state.toolCalls.map((toolCall) => {
      if (toolCall.toolCallId !== callId) return toolCall;
      return { ...toolCall, status };
    }),
  };
}

function handleTextDelta(
  state: SubAgentProjectionState,
  event: SubAgentProjectionEvent<typeof TEXT_DELTA>,
): SubAgentProjectionState {
  return {
    ...state,
    fullOutput: state.fullOutput + event.data.delta,
    parts: appendTextPart(state.parts, event.data.delta),
  };
}

function handleToolCallStart(
  state: SubAgentProjectionState,
  event: SubAgentProjectionEvent<typeof TOOL_CALL_START>,
): SubAgentProjectionState {
  const { toolName, toolArgs, toolCallId } = event.data;
  const callId = event.relatedToolCallId ?? toolCallId;
  const toolCall = {
    toolName,
    toolArgs,
    toolCallId: callId,
    status: "pending" as const,
  };

  return {
    ...state,
    parts: [...state.parts, { type: "tool-call", ...toolCall }],
    toolCalls: [...state.toolCalls, toolCall],
  };
}

function handleToolCallEnd(
  state: SubAgentProjectionState,
  event: SubAgentProjectionEvent<typeof TOOL_CALL_END>,
): SubAgentProjectionState {
  const callId = event.relatedToolCallId ?? event.data.toolCallId;
  const status = event.data.status === "error" ? "error" : "completed";
  return updateToolCallStatus(state, callId, status);
}

export function reduceSubAgentEvent(
  state: SubAgentProjectionState,
  event: AnyAgentEvent,
): SubAgentProjectionState {
  const timedState = rememberTimestamp(state, event);

  switch (event.type) {
    case TEXT_DELTA:
      return handleTextDelta(timedState, event);
    case TOOL_CALL_START:
      return handleToolCallStart(timedState, event);
    case TOOL_CALL_END:
      return handleToolCallEnd(timedState, event);
    default:
      return timedState;
  }
}
