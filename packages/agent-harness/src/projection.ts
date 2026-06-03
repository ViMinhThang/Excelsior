import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, Session, Workspace } from "@excelsior/core";
import type { AnyHarnessEvent } from "./events.js";
import {
  ERROR,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
  USER_INPUT,
} from "./events.js";
import type { HarnessSnapshot } from "./types.js";

interface PendingAssistant {
  id: string;
  text: string;
  timestamp: string;
}

interface PendingTool {
  id: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "completed" | "error";
  result: string;
  timestamp: string;
}

export function projectHarnessState(input: {
  events: readonly AnyHarnessEvent[];
  isLoading: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  workspace: Workspace;
  mode: HarnessSnapshot["mode"];
  pendingConfirmation: HarnessSnapshot["pendingConfirmation"];
  pendingQuestion: HarnessSnapshot["pendingQuestion"];
}): HarnessSnapshot {
  return {
    displayBlocks: projectEventsToDisplayBlocks(input.events),
    isLoading: input.isLoading,
    sessions: input.sessions,
    currentSessionId: input.currentSessionId,
    workspace: input.workspace,
    mode: input.mode,
    pendingConfirmation: input.pendingConfirmation,
    pendingQuestion: input.pendingQuestion,
  };
}

export function projectEventsToMessages(events: readonly AnyHarnessEvent[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  let assistantText = "";

  const flushAssistant = () => {
    const text = assistantText.trim();
    if (text) messages.push({ role: "assistant", content: text });
    assistantText = "";
  };

  for (const event of events) {
    if (event.type === USER_INPUT) {
      flushAssistant();
      messages.push({ role: "user", content: event.data.content });
    } else if (event.type === TEXT_DELTA) {
      assistantText += event.data.delta;
    } else if (event.type === TOOL_CALL_END) {
      flushAssistant();
      messages.push({
        role: "user",
        content: `[Tool result: ${event.data.toolName}]\n${event.data.result}`,
      });
    } else if (event.type === ERROR) {
      flushAssistant();
      messages.push({ role: "assistant", content: `Error: ${event.data.message}` });
    }
  }

  flushAssistant();
  return messages;
}

export function projectEventsToDisplayBlocks(events: readonly AnyHarnessEvent[]): ProjectedBlock[] {
  const blocks: ProjectedBlock[] = [];
  let pendingAssistant: PendingAssistant | null = null;
  let pendingTool: PendingTool | null = null;

  const flushAssistant = (frozen: boolean) => {
    if (!pendingAssistant) return;
    blocks.push({
      type: "assistant",
      id: pendingAssistant.id,
      content: pendingAssistant.text,
      timestamp: pendingAssistant.timestamp,
      ...(frozen ? { isFrozen: true as const } : {}),
    });
    pendingAssistant = null;
  };

  const flushTool = (frozen: boolean) => {
    if (!pendingTool) return;
    if (pendingTool.toolName === "spawnSubAgent") {
      blocks.push({
        type: "sub-agent",
        id: pendingTool.id,
        role: readRoleFromToolArgs(pendingTool.toolArgs),
        state: buildSubAgentState(pendingTool),
        timestamp: pendingTool.timestamp,
        ...(frozen || pendingTool.status !== "pending" ? { isFrozen: true as const } : {}),
      });
    } else {
      blocks.push({
        type: "tool-call",
        id: pendingTool.id,
        toolName: pendingTool.toolName,
        toolArgs: pendingTool.toolArgs,
        status: pendingTool.status,
        content: pendingTool.result,
        timestamp: pendingTool.timestamp,
        ...(frozen || pendingTool.status !== "pending" ? { isFrozen: true as const } : {}),
      });
    }
    pendingTool = null;
  };

  const flushAll = (frozen: boolean) => {
    flushAssistant(frozen);
    flushTool(frozen);
  };

  for (const event of events) {
    if (event.type === USER_INPUT) {
      flushAll(true);
      blocks.push({
        type: "user",
        id: event.id,
        content: event.data.content,
        timestamp: event.timestamp,
        isFrozen: true,
      });
    } else if (event.type === TEXT_DELTA) {
      flushTool(true);
      const currentAssistant = pendingAssistant as PendingAssistant | null;
      pendingAssistant = currentAssistant
        ? {
            id: currentAssistant.id,
            text: currentAssistant.text + event.data.delta,
            timestamp: event.timestamp,
          }
        : { id: event.id, text: event.data.delta, timestamp: event.timestamp };
    } else if (event.type === TOOL_CALL_START) {
      flushAll(true);
      pendingTool = {
        id: event.data.toolCallId,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status: "pending",
        result: "",
        timestamp: event.timestamp,
      };
    } else if (event.type === TOOL_CALL_END) {
      const status = event.data.status === "error" ? "error" : "completed";
      const currentTool = pendingTool as PendingTool | null;
      if (currentTool && currentTool.id === event.data.toolCallId) {
        pendingTool = {
          id: currentTool.id,
          toolName: currentTool.toolName,
          toolArgs: currentTool.toolArgs,
          status,
          result: event.data.result,
          timestamp: event.timestamp,
        };
        flushTool(true);
      } else {
        pendingTool = {
          id: event.data.toolCallId,
          toolName: event.data.toolName,
          toolArgs: event.data.toolArgs,
          status,
          result: event.data.result,
          timestamp: event.timestamp,
        };
        flushTool(true);
      }
    } else if (event.type === ERROR) {
      flushAll(true);
      blocks.push({
        type: "assistant",
        id: event.id,
        content: `Error: ${event.data.message}`,
        timestamp: event.timestamp,
        isFrozen: true,
      });
    }
  }

  flushAll(false);
  return blocks;
}

function readRoleFromToolArgs(rawArgs: string): string {
  try {
    const parsed = JSON.parse(rawArgs) as { role?: unknown };
    return typeof parsed.role === "string" && parsed.role.trim()
      ? parsed.role
      : "SubAgent";
  } catch {
    return rawArgs || "SubAgent";
  }
}

function buildSubAgentState(tool: PendingTool): ProjectedSubAgent {
  const lines = tool.result.split(/\r?\n/).filter(Boolean);
  return {
    status: tool.status === "error" ? "error" : tool.status === "completed" ? "done" : "running",
    latestLine: lines.at(-1) ?? "",
    fullOutput: tool.result,
    toolCalls: [],
    parts: tool.result ? [{ type: "text", text: tool.result }] : [],
    startTime: tool.timestamp ? new Date(tool.timestamp).getTime() : undefined,
    endTime: tool.status === "pending" ? undefined : Date.now(),
  };
}
