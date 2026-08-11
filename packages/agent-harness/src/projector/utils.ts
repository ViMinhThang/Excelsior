import type { AgentMessage, ProjectedBlock, ProjectedSubAgent } from "@excelsior/core";
import {
  SUB_AGENT_EVENT,
  type AnyHarnessEvent,
  type HarnessMessage,
} from "../events.js";
import type { ToolDraft } from "./types.js";

type ToolExecutionEvent = Extract<
  AnyHarnessEvent,
  { type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end" }
>;

export function toolDisplayBlockId(event: ToolExecutionEvent): string {
  return `${event.turnId ?? event.runId}:${event.data.toolCallId}`;
}

export function toolBlockFromDraft(
  tool: ToolDraft,
  forceFrozen?: boolean,
  subAgentState?: ProjectedSubAgent,
): ProjectedBlock {
  if (tool.toolName === "spawnSubAgent") {
    return {
      type: "sub-agent",
      id: tool.id,
      role: readRoleFromToolArgs(tool.toolArgs),
      state: subAgentState ?? buildSubAgentState(tool),
      timestamp: tool.timestamp,
      ...(forceFrozen || tool.status !== "pending" ? { isFrozen: true as const } : {}),
    };
  }

  return {
    type: "tool-call",
    id: tool.id,
    toolName: tool.toolName,
    toolArgs: tool.toolArgs,
    status: tool.status,
    content: tool.result,
    timestamp: tool.timestamp,
    ...(forceFrozen || tool.status !== "pending" ? { isFrozen: true as const } : {}),
  };
}

export function toAgentMessage(message: HarnessMessage): AgentMessage {
  return {
    role: message.role,
    content: message.modelContent ?? message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  };
}

export function readRoleFromToolArgs(rawArgs: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch {
    return rawArgs || "SubAgent";
  }
  const role = parsed && typeof parsed === "object" ? (parsed as { role?: unknown }).role : undefined;
  return typeof role === "string" && role.trim() ? role : "SubAgent";
}

export function buildSubAgentState(tool: ToolDraft): ProjectedSubAgent {
  const lines = tool.result.split(/\r?\n/).filter(Boolean);
  return {
    status: tool.status === "error" ? "error" : tool.status === "completed" ? "done" : "running",
    latestLine: lines.at(-1) ?? "",
    fullOutput: tool.result,
    toolCalls: [],
    parts: tool.result ? [{ type: "text", text: tool.result }] : [],
    startTime: new Date(tool.startTimestamp).getTime(),
    endTime: tool.status === "pending" || !tool.endTimestamp
      ? undefined
      : new Date(tool.endTimestamp).getTime(),
  };
}

export function updateSubAgentState(
  previous: ProjectedSubAgent | undefined,
  event: Extract<AnyHarnessEvent, { type: typeof SUB_AGENT_EVENT }>["data"]["event"],
  timestamp: string,
): ProjectedSubAgent {
  const startTime = previous?.startTime ?? new Date(timestamp).getTime();
  const base: ProjectedSubAgent = previous ?? {
    status: "running",
    latestLine: "",
    fullOutput: "",
    toolCalls: [],
    parts: [],
    startTime,
  };

  if (event.type === "text_delta") {
    const fullOutput = `${base.fullOutput}${event.delta}`;
    return {
      ...base,
      fullOutput,
      latestLine: latestLine(fullOutput),
      parts: appendTextPart(base.parts, event.delta),
    };
  }

  if (event.type === "tool_start") {
    const call = {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      toolArgs: event.toolArgs,
      status: "pending" as const,
    };
    return {
      ...base,
      toolCalls: [...base.toolCalls, call],
      parts: [...base.parts, { type: "tool-call", ...call }],
    };
  }

  if (event.type === "tool_update") {
    return {
      ...base,
      toolCalls: base.toolCalls.map((call) =>
        call.toolCallId === event.toolCallId
          ? { ...call, toolArgs: `${call.toolArgs}${event.delta}` }
          : call
      ),
      parts: base.parts.map((part) =>
        part.type === "tool-call" && part.toolCallId === event.toolCallId
          ? { ...part, toolArgs: `${part.toolArgs}${event.delta}` }
          : part
      ),
    };
  }

  if (event.type === "tool_end") {
    const status = event.isError ? "error" as const : "completed" as const;
    const content = event.result ?? "";
    return {
      ...base,
      toolCalls: base.toolCalls.map((call) =>
        call.toolCallId === event.toolCallId
          ? { ...call, toolName: event.toolName, toolArgs: event.toolArgs, status, content }
          : call
      ),
      parts: base.parts.map((part) =>
        part.type === "tool-call" && part.toolCallId === event.toolCallId
          ? { ...part, toolName: event.toolName, toolArgs: event.toolArgs, status, content }
          : part
      ),
    };
  }

  if (event.type === "final") {
    const fullOutput = event.content || base.fullOutput;
    return {
      ...base,
      status: "done",
      fullOutput,
      latestLine: latestLine(fullOutput),
      endTime: new Date(timestamp).getTime(),
      parts: base.parts.length > 0 ? base.parts : [{ type: "text", text: fullOutput }],
    };
  }

  const fullOutput = `${base.fullOutput}${base.fullOutput ? "\n" : ""}Error: ${event.message}`;
  return {
    ...base,
    status: "error",
    fullOutput,
    latestLine: latestLine(fullOutput),
    endTime: new Date(timestamp).getTime(),
    parts: appendTextPart(base.parts, `${base.parts.length ? "\n" : ""}Error: ${event.message}`),
  };
}

export function appendTextPart(parts: ProjectedSubAgent["parts"], delta: string): ProjectedSubAgent["parts"] {
  const last = parts.at(-1);
  if (last?.type === "text") {
    last.text = `${last.text}${delta}`;
    return parts;
  }
  return [...parts, { type: "text", text: delta }];
}

export function latestLine(text: string): string {
  return text.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}
