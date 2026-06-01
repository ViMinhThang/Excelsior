import type { AnyAgentEvent } from "../../runtime/events.js";
import type { ProjectedBlock, ProjectedSubAgent } from "@excelsior/core";
import { projectEvents, ProjectionRegistry, type ReadModel } from "../readModel.js";
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
  .on("text-delta", (state, event) => ({
    ...state,
    fullOutput: state.fullOutput + event.data.delta,
    parts: appendTextPart(state.parts, event.data.delta),
  }))
  .on("tool-call-start", handleToolCallStart)
  .on("tool-call-end", handleToolCallEnd)
  .build();


const TIMED_SUB_AGENT_MODEL: ReadModel<SubAgentProjectionState, AnyAgentEvent> = {
  initialState: SUB_AGENT_MODEL.initialState,
  apply: (state, event) => SUB_AGENT_MODEL.apply(rememberTimestamp(state, event), event),
};

export function projectSubAgentEvents(
  childEvents: readonly AnyAgentEvent[],
  status: SubAgentProjectionStatus,
  fallbackTimestamp?: string,
): ProjectedSubAgent {
  return finalizeSubAgentProjection(
    projectEvents(TIMED_SUB_AGENT_MODEL, childEvents),
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
