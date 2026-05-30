import { AnyAgentEvent } from "../runtime/events.js";
import { defineReadModel, projectEvents, ProjectionRegistry, type ReadModel } from "@excelsior/projection";
import { CHILD_RUN_ATTACHED, RUN_START, RUN_END, USER_INPUT, TEXT_DELTA, TOOL_CALL_END, TOOL_CALL_START, ERROR, PERSISTENCE_ERROR, TURN_COMPLETE, HISTORY_COMPACTED } from "../runtime/eventNames.js";
import type { AgentMessage } from "@excelsior/core";

export interface AIHistoryProjectionState {
  messages: AgentMessage[];
  pendingAssistant: string;
}

export function createAIHistoryProjectionState(): AIHistoryProjectionState {
  return { messages: [], pendingAssistant: "" };
}

function flushPendingAssistant(state: AIHistoryProjectionState): AIHistoryProjectionState {
  if (!state.pendingAssistant) return state;
  return {
    messages: [
      ...state.messages,
      { role: "assistant", content: state.pendingAssistant },
    ],
    pendingAssistant: "",
  };
}

function appendMessage(
  state: AIHistoryProjectionState,
  message: AgentMessage,
): AIHistoryProjectionState {
  return {
    ...state,
    messages: [...state.messages, message],
  };
}

export function projectEventsToAIMessages(
  events: readonly AnyAgentEvent[],
): AgentMessage[] {
  return finalizeAIHistoryProjection(projectEvents(AI_HISTORY_MODEL, events));
}

export function finalizeAIHistoryProjection(
  state: AIHistoryProjectionState,
): AgentMessage[] {
  return flushPendingAssistant(state).messages;
}

export const AI_HISTORY_MODEL: ReadModel<AIHistoryProjectionState, AnyAgentEvent> = new ProjectionRegistry<
  AIHistoryProjectionState,
  AnyAgentEvent
>()
  .initialState(createAIHistoryProjectionState)
  .on("user-input", (state, event) => {
    const flushed = flushPendingAssistant(state);
    return appendMessage(flushed, { role: "user", content: event.data.content });
  })
  .on("text-delta", (state, event) => ({
    ...state,
    pendingAssistant: state.pendingAssistant + event.data.delta,
  }))
  .on("tool-call-end", (state, event) => {
    const flushed = flushPendingAssistant(state);
    const { result, toolName, toolArgs, status } = event.data;
    const isError = status === "error" || result?.startsWith("[Error]");
    const label = isError ? "[Error]" : "[Completed]";
    return appendMessage(flushed, {
      role: "assistant",
      content: `[Tool: ${toolName}(${toolArgs})] ${label}\n${result ?? ""}`,
    });
  })
  .on("error", (state, event) => {
    const flushed = flushPendingAssistant(state);
    return appendMessage(flushed, { role: "assistant", content: `[Error] ${event.data.message}` });
  })
  .on("history-compacted", (state, event) => ({
    messages: [
      {
        role: "system",
        content: `Previous conversation compacted for context. Chronological summary of earlier turns:\n\n${event.data.summary}`,
      },
    ],
    pendingAssistant: "",
  }))
  .build();
