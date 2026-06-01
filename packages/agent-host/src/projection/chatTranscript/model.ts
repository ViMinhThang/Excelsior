import type { AnyAgentEvent } from "../../runtime/events.js";
import type { ProjectedBlock } from "@excelsior/core";
import { projectEvents, ProjectionRegistry, type ReadModel } from "../readModel.js";
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

export const CHAT_TRANSCRIPT_MODEL: ReadModel<
  ChatTranscriptProjectionState,
  AnyAgentEvent,
  ChatTranscriptProjectionContext
> = new ProjectionRegistry<
  ChatTranscriptProjectionState,
  AnyAgentEvent,
  ChatTranscriptProjectionContext
>()
  .initialState(createChatTranscriptProjectionState)
  .on("child-run-attached", handleChildRunAttached)
  .on("user-input", handleUserInput)
  .on("text-delta", handleTextDelta)
  .on("tool-call-start", handleToolCallStart)
  .on("tool-call-end", handleToolCallEnd)
  .on("error", handleError)
  .on("persistence-error", handlePersistenceError)
  .on("run-end", (state, _event, context) => flushAll(state, context))
  .build();

export function reduceChatTranscriptEvent(
  state: ChatTranscriptProjectionState,
  event: AnyAgentEvent,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  return CHAT_TRANSCRIPT_MODEL.apply(state, event, context);
}

export function projectEventsToDisplayBlocks(
  events: readonly AnyAgentEvent[],
  context?: ChatTranscriptProjectionContext,
): ProjectedBlock[] {
  const state = projectEvents(CHAT_TRANSCRIPT_MODEL, events, context);
  return finalizeChatTranscriptProjection(state, context);
}
