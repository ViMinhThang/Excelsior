import { ToolCallInfo } from "../../types.js";

export type ToolCallStatus = "pending" | "completed" | "error";

export type DisplayBlock =
  | { type: "user"; id: string; content: string; timestamp: string; isFrozen?: true }
  | { type: "assistant"; id: string; content: string; timestamp: string; isFrozen?: true }
  | { type: "tool-call"; id: string; toolName: string; toolArgs: string; status: ToolCallStatus; content: string; timestamp: string; isFrozen?: true }
  | { type: "sub-agent"; id: string; role: string; state: SubAgentDisplayState; timestamp: string; isFrozen?: true };

export interface SubAgentDisplayState {
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentPart[];
  startTime?: number;
  endTime?: number;
}

export type SubAgentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; toolArgs: string; toolCallId: string; status: "pending" | "completed" | "error" };

export type SubAgentOutputPart = SubAgentPart;

export interface SubAgentState {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  outputParts: SubAgentPart[];
  toolCalls: ToolCallInfo[];
  startTime?: number;
  endTime?: number;
}
