import type { ProjectedSubAgent, ToolCallInfo } from "@excelsior/core";

export function cleanSubAgentRole(role: string): string {
  return (role || "Sub-agent")
    .replace(/\bTask\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim();
}

export function formatDuration(ms: number): string {
  const secs = Math.max(0, ms / 1000);
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.floor(secs % 60);
  return `${mins}m ${remSecs}s`;
}

export function getSubAgentDuration(agent: ProjectedSubAgent, now: number): string {
  const start = agent.startTime || now;
  const end = agent.endTime || now;
  return formatDuration(end - start);
}

export function formatToolCallSummary(toolCall: ToolCallInfo): string {
  const detail = summarizeToolArgs(toolCall.toolArgs);
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

function summarizeToolArgs(rawArgs: string): string {
  if (!rawArgs) return "";

  try {
    const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
    const parts = [
      valueText(parsed.command),
      arrayText(parsed.args),
      valueText(parsed.filePath),
      valueText(parsed.pattern),
    ].filter(Boolean);

    if (parts.length > 0) return compact(parts.join(" "), 64);
  } catch {
    // Fall through to compact raw args.
  }

  return compact(rawArgs.replace(/\s+/g, " "), 64);
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join(" ")
    : "";
}

function compact(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
