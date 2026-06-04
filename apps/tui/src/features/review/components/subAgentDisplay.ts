import {
  summarizeKnownToolArgs,
  type ProjectedSubAgent,
  type ToolCallInfo,
} from "@excelsior/core";
import { formatElapsedMs } from "../../../lib/timeFormat.js";

export function cleanSubAgentRole(role: string): string {
  return (role || "Sub-agent")
    .replace(/\bTask\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim();
}

export function getSubAgentDuration(agent: ProjectedSubAgent, now: number): string {
  const start = agent.startTime || now;
  const end = agent.endTime || now;
  return formatElapsedMs(end - start);
}

export function formatToolCallSummary(toolCall: ToolCallInfo): string {
  const detail = summarizeKnownToolArgs(toolCall.toolArgs);
  return detail ? `${toolCall.toolName} ${detail}` : toolCall.toolName;
}

export function getSubAgentActivity(agent: ProjectedSubAgent): string {
  const latestToolCall = agent.toolCalls.at(-1);
  if (agent.status === "running" && latestToolCall) {
    return formatToolCallSummary(latestToolCall);
  }
  if (agent.status === "running" && agent.latestLine) {
    return compact(agent.latestLine, 64);
  }

  const toolCount = agent.toolCalls.length;
  return `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`;
}

function compact(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
