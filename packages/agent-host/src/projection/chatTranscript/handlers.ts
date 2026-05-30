import {
  CHILD_RUN_ATTACHED,
  ERROR,
  PERSISTENCE_ERROR,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
  USER_INPUT,
} from "../../runtime/eventNames.js";
import {
  extractSubAgentRole,
  flushAll,
  flushAssistant,
  updateExistingToolResult,
} from "./flush.js";
import type {
  ChatTranscriptEvent,
  ChatTranscriptProjectionContext,
  ChatTranscriptProjectionState,
} from "./state.js";

export function handleChildRunAttached(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof CHILD_RUN_ATTACHED>,
): ChatTranscriptProjectionState {
  const next = new Map(state.childRunIdByToolCallId);
  next.set(event.data.parentToolCallId, {
    childRunId: event.data.childRunId,
    role: event.data.role,
  });
  return { ...state, childRunIdByToolCallId: next };
}

export function handleUserInput(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof USER_INPUT>,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  const flushed = flushAll(state, context);
  return {
    ...flushed,
    blocks: [
      ...flushed.blocks,
      {
        type: "user",
        id: event.id,
        content: event.data.content,
        timestamp: event.timestamp,
        isFrozen: true,
      },
    ],
  };
}

export function handleTextDelta(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof TEXT_DELTA>,
): ChatTranscriptProjectionState {
  if (state.pendingAssistant) {
    return {
      ...state,
      pendingAssistant: {
        ...state.pendingAssistant,
        fullText: state.pendingAssistant.fullText + event.data.delta,
        timestamp: event.timestamp,
      },
    };
  }
  return {
    ...state,
    pendingAssistant: {
      id: event.id,
      fullText: event.data.delta,
      timestamp: event.timestamp,
    },
  };
}

export function handleToolCallStart(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof TOOL_CALL_START>,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  const flushed = flushAll(state, context);
  const toolCallId = event.relatedToolCallId ?? event.data.toolCallId;
  const isSubAgent = event.data.toolName === "spawnSubAgent";

  return {
    ...flushed,
    pendingTool: {
      toolName: event.data.toolName,
      toolArgs: isSubAgent
        ? extractSubAgentRole(event.data.toolArgs)
        : event.data.toolArgs,
      toolCallId,
      status: "pending",
      result: "",
      isSubAgent,
    },
  };
}

export function handleToolCallEnd(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof TOOL_CALL_END>,
): ChatTranscriptProjectionState {
  const toolCallId = event.relatedToolCallId ?? event.data.toolCallId;
  const status = event.data.status === "error" ? "error" : "completed";
  const result = event.data.result ?? "";

  if (state.pendingTool?.toolCallId === toolCallId) {
    return {
      ...state,
      pendingTool: { ...state.pendingTool, status, result },
    };
  }

  const updated = updateExistingToolResult(
    state,
    toolCallId,
    status,
    result,
    event.timestamp,
  );
  if (updated) return updated;

  if (event.data.toolName === "spawnSubAgent") return state;

  const flushed = flushAssistant(state);
  return {
    ...flushed,
    blocks: [
      ...flushed.blocks,
      {
        type: "tool-call",
        id: event.id,
        toolName: event.data.toolName || "unknown",
        toolArgs: JSON.stringify(event.data.toolArgs ?? {}),
        status,
        content: result,
        timestamp: event.timestamp,
        isFrozen: true,
      },
    ],
  };
}

export function handleError(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof ERROR>,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  const flushed = flushAll(state, context);
  return {
    ...flushed,
    blocks: [
      ...flushed.blocks,
      {
        type: "assistant",
        id: event.id,
        content: `Error: ${event.data.message ?? "Unknown error"}`,
        timestamp: event.timestamp,
        isFrozen: true,
      },
    ],
  };
}

export function handlePersistenceError(
  state: ChatTranscriptProjectionState,
  event: ChatTranscriptEvent<typeof PERSISTENCE_ERROR>,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  const flushed = flushAll(state, context);
  const failedEvent = event.data.failedEventType
    ? ` (${event.data.failedEventType})`
    : "";
  return {
    ...flushed,
    blocks: [
      ...flushed.blocks,
      {
        type: "assistant",
        id: event.id,
        content: `Persistence warning${failedEvent}: ${
          event.data.message ?? "Unknown persistence error"
        }`,
        timestamp: event.timestamp,
        isFrozen: true,
      },
    ],
  };
}
