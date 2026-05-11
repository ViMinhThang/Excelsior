import { AgentEvent, DisplayBlock, SubAgentDisplayState, SubAgentPart } from "./eventTypes.js";
import { ToolCallInfo } from "../types.js";

function parseToolArgs(args?: unknown): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

interface SubAgentAccum {
  toolCallId: string;
  role: string;
  status: "running" | "done" | "error";
  latestLine: string;
  fullOutput: string;
  toolCalls: ToolCallInfo[];
  parts: SubAgentPart[];
  startTime: number;
  endTime?: number;
  timestamp: string;
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

export function groupEventsForDisplay(events: AgentEvent[]): DisplayBlock[] {
  const blocks: DisplayBlock[] = [];
  let assistant: PendingAssistant | null = null;
  let tool: PendingTool | null = null;

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
      // Sub-agent display blocks are emitted on sub-agent-done, not here
    } else {
      blocks.push({
        type: "tool-call",
        id: tool.id,
        toolName: tool.toolName,
        toolArgs: tool.toolArgs,
        status: tool.status,
        content: tool.result,
        timestamp: tool.timestamp,
      });
    }
    tool = null;
  }

  // Collect sub-agent state keyed by toolCallId
  const subAgents = new Map<string, SubAgentAccum>();

  function getOrInitSA(toolCallId: string): SubAgentAccum {
    let sa = subAgents.get(toolCallId);
    if (!sa) {
      sa = {
        toolCallId,
        role: "",
        status: "running",
        latestLine: "",
        fullOutput: "",
        toolCalls: [],
        parts: [],
        startTime: Date.now(),
        timestamp: new Date().toISOString(),
      };
      subAgents.set(toolCallId, sa);
    }
    return sa;
  }

  function emitSubAgentBlock(sa: SubAgentAccum) {
    if (!sa.role) return;
    blocks.push({
      type: "sub-agent",
      id: sa.toolCallId,
      role: sa.role,
      state: {
        status: sa.status,
        latestLine: sa.latestLine,
        fullOutput: sa.fullOutput,
        toolCalls: sa.toolCalls,
        parts: sa.parts,
        startTime: sa.startTime,
        endTime: sa.endTime,
      },
      timestamp: sa.timestamp,
    });
  }

  for (const evt of events) {
    switch (evt.type) {
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

        if (isSubAgent) {
          let role = "";
          try { role = JSON.parse(toolArgs).role ?? ""; } catch { role = toolArgs; }
          const sa = getOrInitSA(toolCallId);
          sa.role = role;
          sa.startTime = new Date(evt.timestamp).getTime();
          sa.timestamp = evt.timestamp;
        }

        tool = {
          id: evt.id,
          toolName,
          toolArgs: isSubAgent
            ? JSON.stringify({ role: (() => { try { return JSON.parse(toolArgs).role; } catch { return toolArgs; } })() })
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
          if (tool.isSubAgent) {
            const sa = subAgents.get(toolCallId);
            if (sa) {
              sa.status = status === "error" ? "error" : "done";
              sa.endTime = Date.now();
              sa.fullOutput = result ?? "";
              const lines = result?.split("\n").filter(Boolean) ?? [];
              sa.latestLine = lines[lines.length - 1] || result || "";
            }
            tool.status = status;
            tool.result = sa?.latestLine ?? result ?? "";
            // Emit sub-agent block inline when the tool completes
            if (sa) emitSubAgentBlock(sa);
          } else {
            tool.status = status;
            tool.result = result ?? "";
          }
          flushTool();
        } else if (toolName === "spawnSubAgent") {
          // Tool-call-end matches spawnSubAgent but tool already consumed
          const sa = subAgents.get(toolCallId);
          if (sa) {
            sa.status = status === "error" ? "error" : "done";
            sa.endTime = Date.now();
            sa.fullOutput = result ?? "";
            const lines = result?.split("\n").filter(Boolean) ?? [];
            sa.latestLine = lines[lines.length - 1] || result || "";
            emitSubAgentBlock(sa);
          }
        } else {
          // Orphaned tool-call-end
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

      case "sub-agent-spawned": {
        const toolCallId = evt.parentEventId ?? "";
        const role = evt.data.role as string;
        if (toolCallId) {
          const sa = getOrInitSA(toolCallId);
          sa.toolCallId = toolCallId;
          if (role) sa.role = role;
          sa.status = "running";
          sa.startTime = new Date(evt.timestamp).getTime();
          sa.timestamp = evt.timestamp;
        }
        break;
      }

      case "sub-agent-output": {
        const toolCallId = evt.parentEventId ?? "";
        const output = evt.data.output as string;
        const sa = subAgents.get(toolCallId);
        if (sa) {
          if (output) {
            const delta = output.slice(sa.fullOutput.length);
            if (delta) sa.parts.push({ type: "text", text: delta });
          }
          sa.fullOutput = output ?? sa.fullOutput;
          const lines = sa.fullOutput.split("\n").filter(Boolean);
          sa.latestLine = lines[lines.length - 1] || sa.latestLine;
        }
        break;
      }

      case "sub-agent-done": {
        const toolCallId = evt.parentEventId ?? "";
        const fullOutput = evt.data.fullOutput as string;
        const sa = subAgents.get(toolCallId);
        if (sa) {
          sa.status = "done";
          sa.endTime = Date.now();
          sa.fullOutput = fullOutput ?? sa.fullOutput;
          const lines = sa.fullOutput.split("\n").filter(Boolean);
          sa.latestLine = lines[lines.length - 1] || sa.latestLine;
          emitSubAgentBlock(sa);
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

  // Emit any sub-agents still running (no tool-call-end yet)
  for (const [, sa] of subAgents) {
    if (!sa.role) continue;
    if (sa.endTime !== undefined) continue; // already emitted inline
    emitSubAgentBlock(sa);
  }

  return blocks;
}
