import { defineReadModel, projectEvents, type ReadModel } from "@excelsior/projection";
import type { AnyAgentEvent } from "../../runtime/events.js";
import type { ProjectedBlock, ProjectedSubAgent } from "../display.js";
import { reduceSubAgentEvent } from "./handlers.js";
import {
  createSubAgentProjectionState,
  type SubAgentProjectionState,
  type SubAgentProjectionStatus,
} from "./state.js";
import { finalizeSubAgentProjection } from "./timing.js";

export const SUB_AGENT_MODEL: ReadModel<SubAgentProjectionState, AnyAgentEvent> =
  defineReadModel<SubAgentProjectionState, AnyAgentEvent>({
    initialState: createSubAgentProjectionState,
    apply: reduceSubAgentEvent,
  });

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
