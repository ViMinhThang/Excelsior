import type { SubAgentProjectionPart, ToolCallInfo } from "@excelsior/core";
import type { AnyAgentEvent } from "../../runtime/events.js";

export type SubAgentProjectionStatus = "running" | "done" | "error";
export type SubAgentToolStatus = "pending" | "completed" | "error";

export type SubAgentProjectionEvent<TType extends AnyAgentEvent["type"]> =
  Extract<AnyAgentEvent, { type: TType }>;

export interface SubAgentProjectionState {
  parts: SubAgentProjectionPart[];
  toolCalls: ToolCallInfo[];
  fullOutput: string;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export function createSubAgentProjectionState(): SubAgentProjectionState {
  return {
    parts: [],
    toolCalls: [],
    fullOutput: "",
  };
}
