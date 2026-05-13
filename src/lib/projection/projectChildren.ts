import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock, ProjectedSubAgent, SubAgentProjectionPart } from "./display.js";
import { ToolCallInfo } from "../../types.js";

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
  let startTime = Date.now();
  let endTime = Date.now();

  for (const evt of childEvents) {
    switch (evt.type) {
      case "text-delta": {
        const delta = evt.data.delta;
        fullOutput += delta;
        const partsLen = parts.length;
        if (partsLen > 0 && parts[partsLen - 1].type === "text") {
          const last = parts[partsLen - 1] as SubAgentProjectionPart & { type: "text" };
          parts[partsLen - 1] = { type: "text", text: last.text + delta };
        } else {
          parts.push({ type: "text", text: delta });
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
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.type === "tool-call" && p.toolCallId === callId) {
            parts[i] = { ...p, status: tcStatus };
          }
        }
        toolCalls.forEach((tc, i) => {
          if (tc.toolCallId === callId) {
            toolCalls[i] = { ...tc, status: tcStatus };
          }
        });
        break;
      }
      default:
        break;
    }
  }

  const lines = fullOutput.split("\n").filter(Boolean);
  const latestLine = lines[lines.length - 1] || "";

  if (childEvents.length > 0) {
    startTime = new Date(childEvents[0].timestamp).getTime();
    const last = childEvents[childEvents.length - 1];
    endTime = status === "running" ? Date.now() : new Date(last.timestamp).getTime();
  } else if (fallbackTimestamp) {
    startTime = new Date(fallbackTimestamp).getTime();
    endTime = status === "running" ? Date.now() : startTime;
  }

  return {
    status,
    latestLine,
    fullOutput,
    toolCalls,
    parts,
    startTime,
    endTime,
  };
}
