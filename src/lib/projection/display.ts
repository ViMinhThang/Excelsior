import { ToolCallInfo } from "../runtime/toolCallInfo.js";

export type ToolCallStatus = "pending" | "completed" | "error";

export type ProjectedBlock =
  | { type: "user"; id: string; content: string; timestamp: string; isFrozen?: true }
  | { type: "assistant"; id: string; content: string; timestamp: string; isFrozen?: true }
  | { type: "tool-call"; id: string; toolName: string; toolArgs: string; status: ToolCallStatus; content: string; timestamp: string; isFrozen?: true }
  | { type: "sub-agent"; id: string; role: string; state: ProjectedSubAgent; timestamp: string; isFrozen?: true };

export interface ProjectedSubAgent {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentProjectionPart[];
  startTime?: number;
  endTime?: number;
}

export type SubAgentProjectionPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; toolArgs: string; toolCallId: string; status: "pending" | "completed" | "error" };

export interface SubAgentViewModel {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  outputParts: SubAgentProjectionPart[];
  toolCalls: ToolCallInfo[];
  startTime?: number;
  endTime?: number;
}

export function toSubAgentViewModel(
  display: ProjectedSubAgent,
  toolCallId: string,
  role: string,
): SubAgentViewModel {
  return {
    toolCallId,
    role,
    status: display.status,
    latestLine: display.latestLine,
    fullOutput: display.fullOutput,
    outputParts: display.parts,
    toolCalls: display.toolCalls,
    startTime: display.startTime,
    endTime: display.endTime,
  };
}
