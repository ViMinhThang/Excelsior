import { defineReadModel, projectEvents, type ReadModel } from "@excelsior/projection";
import type { AnyAgentEvent } from "../../runtime/events.js";
import {
  CHILD_RUN_ATTACHED,
  ERROR,
  PERSISTENCE_ERROR,
  RUN_END,
  RUN_START,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
  TURN_COMPLETE,
  USER_INPUT,
} from "../../runtime/eventNames.js";
import type { ProjectedBlock } from "../display.js";
import { flushAll, finalizeChatTranscriptProjection } from "./flush.js";
import {
  handleChildRunAttached,
  handleError,
  handlePersistenceError,
  handleTextDelta,
  handleToolCallEnd,
  handleToolCallStart,
  handleUserInput,
} from "./handlers.js";
import {
  createChatTranscriptProjectionState,
  type ChatTranscriptProjectionContext,
  type ChatTranscriptProjectionState,
} from "./state.js";

export function reduceChatTranscriptEvent(
  state: ChatTranscriptProjectionState,
  event: AnyAgentEvent,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  switch (event.type) {
    case CHILD_RUN_ATTACHED:
      return handleChildRunAttached(state, event);
    case USER_INPUT:
      return handleUserInput(state, event, context);
    case TEXT_DELTA:
      return handleTextDelta(state, event);
    case TOOL_CALL_START:
      return handleToolCallStart(state, event, context);
    case TOOL_CALL_END:
      return handleToolCallEnd(state, event);
    case ERROR:
      return handleError(state, event, context);
    case PERSISTENCE_ERROR:
      return handlePersistenceError(state, event, context);
    case RUN_START:
    case TURN_COMPLETE:
      return state;
    case RUN_END:
      return flushAll(state, context);
  }
}

export function projectEventsToDisplayBlocks(
  events: readonly AnyAgentEvent[],
  context?: ChatTranscriptProjectionContext,
): ProjectedBlock[] {
  const state = projectEvents(CHAT_TRANSCRIPT_MODEL, events, context);
  return finalizeChatTranscriptProjection(state, context);
}

export const CHAT_TRANSCRIPT_MODEL: ReadModel<
  ChatTranscriptProjectionState,
  AnyAgentEvent,
  ChatTranscriptProjectionContext
> = defineReadModel<
  ChatTranscriptProjectionState,
  AnyAgentEvent,
  ChatTranscriptProjectionContext
>({
  initialState: createChatTranscriptProjectionState,
  apply(state, event, context) {
    return reduceChatTranscriptEvent(state, event, context);
  },
});
