import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock, ProjectedSubAgent, SubAgentProjectionPart } from "./display.js";
import { ToolCallInfo } from "../runtime/toolCallInfo.js";

function updateToolCallStatus(
  parts: SubAgentProjectionPart[],
  toolCalls: ToolCallInfo[],
  callId: string,
  status: "pending" | "completed" | "error",
): void {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === "tool-call" && p.toolCallId === callId) {
      parts[i] = { type: "tool-call", toolName: p.toolName, toolArgs: p.toolArgs, toolCallId: p.toolCallId, status };
    }
  }
  toolCalls.forEach((tc, i) => {
    if (tc.toolCallId === callId) {
      toolCalls[i] = { ...tc, status };
    }
  });
}

function computeTiming(
  childEvents: readonly AnyAgentEvent[],
  status: "running" | "done" | "error",
  fallbackTimestamp?: string,
): { startTime: number; endTime: number } {
  if (childEvents.length > 0) {
    const startTime = new Date(childEvents[0].timestamp).getTime();
    const last = childEvents[childEvents.length - 1];
    const endTime = status === "running" ? Date.now() : new Date(last.timestamp).getTime();
    return { startTime, endTime };
  }
  if (fallbackTimestamp) {
    const t = new Date(fallbackTimestamp).getTime();
    return { startTime: t, endTime: status === "running" ? Date.now() : t };
  }
  return { startTime: Date.now(), endTime: Date.now() };
}

export function buildSubAgentBlock(
  toolCallId: string,
  childRole: string,
  childEvents: readonly AnyAgentEvent[],
  status: "running" | "done" | "error",
): ProjectedBlock | null {
  const state = projectChildEventsToSubAgentState(childEvents, status);
  return {
    type: "sub-agent",
    id: toolCallId,
    role: childRole,
    state,
    timestamp: childEvents[0]?.timestamp ?? "",
    ...(status !== "running" ? { isFrozen: true as const } : {}),
  };
}

export function projectChildEventsToSubAgentState(
  childEvents: readonly AnyAgentEvent[],
  status: "running" | "done" | "error",
  fallbackTimestamp?: string,
): ProjectedSubAgent {
  const parts: SubAgentProjectionPart[] = [];
  const toolCalls: ToolCallInfo[] = [];
  let fullOutput = "";

  for (const evt of childEvents) {
    switch (evt.type) {
      case "text-delta": {
        fullOutput += evt.data.delta;
        const last = parts[parts.length - 1];
        if (last?.type === "text") {
          parts[parts.length - 1] = { type: "text", text: last.text + evt.data.delta };
        } else {
          parts.push({ type: "text", text: evt.data.delta });
        }
        break;
      }
      case "tool-call-start": {
        const { toolName, toolArgs, toolCallId } = evt.data;
        const callId = evt.relatedToolCallId ?? toolCallId;
        parts.push({ type: "tool-call", toolName, toolArgs, toolCallId: callId, status: "pending" });
        toolCalls.push({ toolName, toolArgs, toolCallId: callId, status: "pending" });
        break;
      }
      case "tool-call-end": {
        const callId = evt.relatedToolCallId ?? evt.data.toolCallId;
        const tcStatus = evt.data.status === "error" ? ("error" as const) : ("completed" as const);
        updateToolCallStatus(parts, toolCalls, callId, tcStatus);
        break;
      }
      default:
        break;
    }
  }

  const lines = fullOutput.split("\n").filter(Boolean);
  const latestLine = lines[lines.length - 1] || "";
  const { startTime, endTime } = computeTiming(childEvents, status, fallbackTimestamp);

  return { status, latestLine, fullOutput, toolCalls, parts, startTime, endTime };
}
