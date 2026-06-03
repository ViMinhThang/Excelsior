import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, Session, Workspace } from "@excelsior/core";
import {
  ERROR,
  HISTORY_COMPACTED,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  type AnyHarnessEvent,
  type HarnessMessage,
} from "./events.js";
import type { HarnessSnapshot } from "./types.js";

interface CanonicalReadModel {
  displayBlocks: ProjectedBlock[];
  aiHistory: AgentMessage[];
}

interface AssistantDraft {
  id: string;
  content: string;
  timestamp: string;
  frozen: boolean;
}

interface ToolDraft {
  id: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "completed" | "error";
  result: string;
  timestamp: string;
  startTimestamp: string;
  endTimestamp?: string;
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
  const readModel = projectEvents(input.events);
  return {
    displayBlocks: readModel.displayBlocks,
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
  return projectEvents(events).aiHistory;
}

export function projectEventsToDisplayBlocks(events: readonly AnyHarnessEvent[]): ProjectedBlock[] {
  return projectEvents(events).displayBlocks;
}

export function projectEvents(events: readonly AnyHarnessEvent[]): CanonicalReadModel {
  const displayBlocks: ProjectedBlock[] = [];
  const aiHistory: AgentMessage[] = [];
  let assistant: AssistantDraft | null = null;
  let tool: ToolDraft | null = null;

  const flushAssistant = (forceFrozen?: boolean) => {
    if (!assistant) return;
    displayBlocks.push({
      type: "assistant",
      id: assistant.id,
      content: assistant.content,
      timestamp: assistant.timestamp,
      ...(forceFrozen || assistant.frozen ? { isFrozen: true as const } : {}),
    });
    assistant = null;
  };

  const flushTool = (forceFrozen?: boolean) => {
    if (!tool) return;
    if (tool.toolName === "spawnSubAgent") {
      displayBlocks.push({
        type: "sub-agent",
        id: tool.id,
        role: readRoleFromToolArgs(tool.toolArgs),
        state: buildSubAgentState(tool),
        timestamp: tool.timestamp,
        ...(forceFrozen || tool.status !== "pending" ? { isFrozen: true as const } : {}),
      });
    } else {
      displayBlocks.push({
        type: "tool-call",
        id: tool.id,
        toolName: tool.toolName,
        toolArgs: tool.toolArgs,
        status: tool.status,
        content: tool.result,
        timestamp: tool.timestamp,
        ...(forceFrozen || tool.status !== "pending" ? { isFrozen: true as const } : {}),
      });
    }
    tool = null;
  };

  const flushAll = (forceFrozen?: boolean) => {
    flushAssistant(forceFrozen);
    flushTool(forceFrozen);
  };

  for (const event of events) {
    if (event.type === MESSAGE_START) {
      const message = event.data.message;
      if (message.role === "assistant") {
        flushTool(true);
        assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp,
          frozen: false,
        };
      }
    } else if (event.type === MESSAGE_UPDATE) {
      flushTool(true);
      assistant = {
        id: event.data.messageId,
        content: event.data.content,
        timestamp: event.timestamp,
        frozen: false,
      };
    } else if (event.type === MESSAGE_END) {
      const message = event.data.message;
      if (message.role === "user") {
        flushAll(true);
        displayBlocks.push({
          type: "user",
          id: message.id,
          content: message.content,
          timestamp: event.timestamp,
          isFrozen: true,
        });
        aiHistory.push(toAgentMessage(message));
      } else if (message.role === "assistant") {
        flushTool(true);
        assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp,
          frozen: true,
        };
        flushAssistant(true);
        if (message.content.trim()) aiHistory.push(toAgentMessage(message));
      } else if (message.role === "tool") {
        aiHistory.push(toAgentMessage(message));
      }
    } else if (event.type === TOOL_EXECUTION_START) {
      flushAssistant(true);
      flushTool(true);
      tool = {
        id: event.data.toolCallId,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status: "pending",
        result: "",
        timestamp: event.timestamp,
        startTimestamp: event.timestamp,
      };
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      const currentTool = tool as ToolDraft | null;
      if (currentTool && currentTool.id === event.data.toolCallId) {
        tool = {
          id: currentTool.id,
          toolName: currentTool.toolName,
          status: currentTool.status,
          result: currentTool.result,
          startTimestamp: currentTool.startTimestamp,
          endTimestamp: currentTool.endTimestamp,
          toolArgs: `${currentTool.toolArgs}${event.data.delta}`,
          timestamp: event.timestamp,
        };
      }
    } else if (event.type === TOOL_EXECUTION_END) {
      const status = event.data.isError ? "error" : "completed";
      const previousTool = tool as ToolDraft | null;
      tool = {
        id: event.data.toolCallId,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status,
        result: event.data.result,
        timestamp: event.timestamp,
        startTimestamp: previousTool?.id === event.data.toolCallId
          ? previousTool.startTimestamp
          : event.timestamp,
        endTimestamp: event.timestamp,
      };
      flushTool(true);
    } else if (event.type === HISTORY_COMPACTED) {
      flushAll(true);
      aiHistory.push({
        role: "system",
        content: `Previous conversation summary:\n${event.data.summary}`,
      });
    } else if (event.type === ERROR) {
      flushAll(true);
      displayBlocks.push({
        type: "assistant",
        id: event.id,
        content: `Error: ${event.data.message}`,
        timestamp: event.timestamp,
        isFrozen: true,
      });
      aiHistory.push({ role: "assistant", content: `Error: ${event.data.message}` });
    }
  }

  flushAll(false);
  return { displayBlocks, aiHistory };
}

function toAgentMessage(message: HarnessMessage): AgentMessage {
  return {
    role: message.role,
    content: message.modelContent ?? message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
  };
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

function buildSubAgentState(tool: ToolDraft): ProjectedSubAgent {
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
