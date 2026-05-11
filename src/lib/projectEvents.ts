import { AgentEvent, DisplayBlock, SubAgentPart } from "./eventTypes.js";
import { ToolCallInfo } from "../types.js";

function parseToolArgs(args?: unknown): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

interface PendingAssistant {
  id: string;
  fullText: string;
  timestamp: string;
}

interface PendingTool {
  id: string;
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
  result: string;
  timestamp: string;
  isSubAgent: boolean;
}

export interface ProjectOptions {
  getChildEvents?: (childSessionId: string) => readonly AgentEvent[];
}

export function groupEventsForDisplay(
  events: readonly AgentEvent[],
  options?: ProjectOptions,
): DisplayBlock[] {
  const blocks: DisplayBlock[] = [];
  let assistant: PendingAssistant | null = null;
  let tool: PendingTool | null = null;
  const childSessionIdByToolCallId = new Map<string, { childSessionId: string; role: string }>();

  function flushAssistant() {
    if (assistant) {
      blocks.push({
        type: "assistant",
        id: assistant.id,
        content: assistant.fullText,
        timestamp: assistant.timestamp,
      });
      assistant = null;
    }
  }

  function flushTool() {
    if (!tool) return;

    if (tool.isSubAgent) {
      const childInfo = childSessionIdByToolCallId.get(tool.toolCallId);
      const childEvents =
        childInfo && options?.getChildEvents
          ? options.getChildEvents(childInfo.childSessionId)
          : [];

      let role = "SubAgent";
      try {
        const parsed = JSON.parse(tool.toolArgs);
        role = parsed.role || role;
      } catch {
        // ignore
      }
      if (childInfo) {
        role = childInfo.role || role;
      }

      const derivedStatus =
        tool.status === "completed" ? "done" : tool.status === "error" ? "error" : "running";

      const subBlock = buildSubAgentBlock(
        tool.id,
        role,
        childEvents,
        derivedStatus,
        tool.timestamp,
      );

      if (subBlock) {
        blocks.push(subBlock);
        tool = null;
        return;
      }
    }

    blocks.push({
      type: "tool-call",
      id: tool.id,
      toolName: tool.toolName,
      toolArgs: tool.toolArgs,
      status: tool.status,
      content: tool.result,
      timestamp: tool.timestamp,
    });
    tool = null;
  }

  function buildSubAgentBlock(
    pendingToolId: string,
    childRole: string,
    childEvents: readonly AgentEvent[],
    status: "running" | "done" | "error",
    fallbackTimestamp: string,
  ): DisplayBlock | null {
    const parts: SubAgentPart[] = [];
    const toolCalls: ToolCallInfo[] = [];
    let fullOutput = "";
    let startTime = Date.now();
    let endTime = Date.now();

    for (const evt of childEvents) {
      if (evt.type === "text-delta") {
        const delta = evt.data.delta as string;
        fullOutput += delta;
        const partsLen = parts.length;
        if (partsLen > 0 && parts[partsLen - 1].type === "text") {
          const last = parts[partsLen - 1] as SubAgentPart & { type: "text" };
          parts[partsLen - 1] = { type: "text", text: last.text + delta };
        } else {
          parts.push({ type: "text", text: delta });
        }
      } else if (evt.type === "tool-call-start") {
        const toolName = evt.data.toolName as string;
        const toolArgs = parseToolArgs(evt.data.toolArgs);
        const callId = evt.relatedToolCallId ?? (evt.data.toolCallId as string);
        parts.push({ type: "tool-call", toolName, toolArgs, toolCallId: callId, status: "pending" });
        toolCalls.push({ toolName, toolArgs, toolCallId: callId, status: "pending" });
      } else if (evt.type === "tool-call-end") {
        const callId = evt.relatedToolCallId ?? (evt.data.toolCallId as string);
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
      }
    }

    const lines = fullOutput.split("\n").filter(Boolean);
    const latestLine = lines[lines.length - 1] || "";

    if (childEvents.length > 0) {
      startTime = new Date(childEvents[0].timestamp).getTime();
      const last = childEvents[childEvents.length - 1];
      endTime = status === "running" ? Date.now() : new Date(last.timestamp).getTime();
    } else {
      startTime = new Date(fallbackTimestamp).getTime();
      endTime = status === "running" ? Date.now() : startTime;
    }

    return {
      type: "sub-agent",
      id: pendingToolId,
      role: childRole,
      state: {
        status,
        latestLine,
        fullOutput,
        toolCalls,
        parts,
        startTime,
        endTime,
      },
      timestamp: childEvents[0]?.timestamp ?? fallbackTimestamp,
    };
  }



  for (const evt of events) {
    switch (evt.type) {
      case "child-session-attached": {
        const childSessionId = evt.data.childSessionId as string;
        const parentToolCallId = evt.data.parentToolCallId as string;
        const role = evt.data.role as string;
        childSessionIdByToolCallId.set(parentToolCallId, { childSessionId, role });
        break;
      }

      case "user-input": {
        flushAssistant();
        flushTool();
        blocks.push({
          type: "user",
          id: evt.id,
          content: evt.data.content as string,
          timestamp: evt.timestamp,
        });
        break;
      }

      case "text-delta": {
        const delta = evt.data.delta as string;
        if (assistant) {
          assistant.fullText += delta;
          assistant.timestamp = evt.timestamp;
        } else {
          assistant = {
            id: evt.id,
            fullText: delta,
            timestamp: evt.timestamp,
          };
        }
        break;
      }

      case "tool-call-start": {
        flushAssistant();
        flushTool();
        const toolName = evt.data.toolName as string;
        const toolArgs = parseToolArgs(evt.data.toolArgs);
        const toolCallId = evt.relatedToolCallId ?? (evt.data.toolCallId as string);
        const isSubAgent = toolName === "spawnSubAgent";

        tool = {
          id: evt.id,
          toolName,
          toolArgs: isSubAgent
            ? JSON.stringify({
                role: (() => {
                  try {
                    return JSON.parse(toolArgs).role;
                  } catch {
                    return toolArgs;
                  }
                })(),
              })
            : toolArgs,
          toolCallId,
          status: "pending",
          result: "",
          timestamp: evt.timestamp,
          isSubAgent,
        };
        break;
      }

      case "tool-call-end": {
        const toolCallId = evt.relatedToolCallId ?? (evt.data.toolCallId as string);
        const result = evt.data.result as string;
        const status = (evt.data.status === "error" ? "error" : "completed") as "completed" | "error";
        const toolName = evt.data.toolName as string;

        if (tool && tool.toolCallId === toolCallId) {
          tool.status = status;
          tool.result = result ?? "";
          flushTool();
        } else if (toolName === "spawnSubAgent") {
          // Orphaned: tool already consumed
        } else {
          flushAssistant();
          blocks.push({
            type: "tool-call",
            id: evt.id,
            toolName: toolName || "unknown",
            toolArgs: parseToolArgs(evt.data.toolArgs),
            status,
            content: result ?? "",
            timestamp: evt.timestamp,
          });
        }
        break;
      }

      case "error": {
        flushAssistant();
        flushTool();
        blocks.push({
          type: "assistant",
          id: evt.id,
          content: `Error: ${String(evt.data.message ?? "Unknown error")}`,
          timestamp: evt.timestamp,
        });
        break;
      }
    }
  }

  flushAssistant();
  flushTool();

  return blocks;
}
