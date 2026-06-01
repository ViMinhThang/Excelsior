import { projectEvents, ProjectionRegistry, compose, accumulate, assign, type ReadModel } from "@excelsior/projection";
import type { AnyAgentEvent } from "../../runtime/events.js";
import type { ProjectedBlock, ProjectedSubAgent } from "@excelsior/core";
import {
  handleToolCallEnd,
  handleToolCallStart,
  rememberTimestamp,
  appendTextPart,
} from "./handlers.js";
import {
  createSubAgentProjectionState,
  type SubAgentProjectionState,
  type SubAgentProjectionStatus,
} from "./state.js";
import { finalizeSubAgentProjection } from "./timing.js";

export const SUB_AGENT_MODEL: ReadModel<SubAgentProjectionState, AnyAgentEvent> = new ProjectionRegistry<
  SubAgentProjectionState,
  AnyAgentEvent
>()
  .initialState(createSubAgentProjectionState)
  // Clean middleware to track start and end timestamps automatically!
  .use((state, event, _context, next) => {
    const timedState = rememberTimestamp(state, event);
    return next(timedState);
  })
  .on(
    "text-delta",
    compose(
      assign("fullOutput", (state, event) => state.fullOutput + event.data.delta),
      accumulate((state, event) => ({ parts: appendTextPart(state.parts, event.data.delta) })),
    ),
  )
  .on("tool-call-start", handleToolCallStart)
  .on("tool-call-end", handleToolCallEnd)
  .build();


export function projectSubAgentEvents(
  childEvents: readonly AnyAgentEvent[],
  status: SubAgentProjectionStatus,
  fallbackTimestamp?: string,
): ProjectedSubAgent {
  return finalizeSubAgentProjection(
    projectEvents(SUB_AGENT_MODEL, childEvents),
    status,
    fallbackTimestamp,
  );
}

export function buildSubAgentBlock(
  toolCallId: string,
  childRole: string,
  childEvents: readonly AnyAgentEvent[],
  status: SubAgentProjectionStatus,
): ProjectedBlock {
  const state = projectSubAgentEvents(childEvents, status);
  return {
    type: "sub-agent",
    id: toolCallId,
    role: childRole,
    state,
    timestamp: childEvents[0]?.timestamp ?? "",
    ...(status !== "running" ? { isFrozen: true as const } : {}),
  };
}
