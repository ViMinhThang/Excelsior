import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, Session, Workspace } from "@excelsior/core";
import {
  ERROR,
  HISTORY_COMPACTED,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  SUB_AGENT_EVENT,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  type AnyHarnessEvent,
  type HarnessMessage,
} from "./events.js";
import type { HarnessSnapshot } from "./types.js";

type ToolExecutionEvent = Extract<
  AnyHarnessEvent,
  { type: typeof TOOL_EXECUTION_START | typeof TOOL_EXECUTION_UPDATE | typeof TOOL_EXECUTION_END }
>;

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
  const displayIdCounts = new Map<string, number>();
  let assistant: AssistantDraft | null = null;
  let tool: ToolDraft | null = null;
  const subAgentStates = new Map<string, ProjectedSubAgent>();

  const flushAssistant = (forceFrozen?: boolean) => {
    if (!assistant) return;
    displayBlocks.push({
      type: "assistant",
      id: nextDisplayBlockId(assistant.id),
      content: assistant.content,
      timestamp: assistant.timestamp,
      ...(forceFrozen || assistant.frozen ? { isFrozen: true as const } : {}),
    });
    assistant = null;
  };

  const flushTool = (forceFrozen?: boolean) => {
    if (!tool) return;
    upsertToolBlock(tool, forceFrozen);
    tool = null;
  };

  const nextDisplayBlockId = (id: string): string => {
    const count = displayIdCounts.get(id) ?? 0;
    displayIdCounts.set(id, count + 1);
    return count === 0 ? id : `${id}:${count + 1}`;
  };

  const upsertToolBlock = (draft: ToolDraft, forceFrozen?: boolean) => {
    const block = toolBlockFromDraft(draft, forceFrozen, subAgentStates.get(draft.id));
    const existingIndex = displayBlocks.findIndex((item) => item.id === block.id);
    if (existingIndex === -1) {
      displayBlocks.push(block);
    } else {
      displayBlocks[existingIndex] = block;
    }
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
          id: nextDisplayBlockId(message.id),
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
      const id = toolDisplayBlockId(event);
      tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status: "pending",
        result: "",
        timestamp: event.timestamp,
        startTimestamp: event.timestamp,
      };
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      const currentTool = tool as ToolDraft | null;
      const id = toolDisplayBlockId(event);
      if (currentTool && currentTool.id === id) {
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
      const id = toolDisplayBlockId(event);
      aiHistory.push({
        role: "assistant",
        content: "",
        tool_calls: [{
          id: event.data.toolCallId,
          type: "function",
          function: {
            name: event.data.toolName,
            arguments: event.data.toolArgs,
          },
        }],
      });
      tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status,
        result: event.data.result,
        timestamp: event.timestamp,
        startTimestamp: previousTool?.id === id
          ? previousTool.startTimestamp
          : event.timestamp,
        endTimestamp: event.timestamp,
      };
      flushTool(true);
    } else if (event.type === SUB_AGENT_EVENT) {
      const id = `${event.turnId ?? event.runId}:${event.data.parentToolCallId}`;
      subAgentStates.set(id, updateSubAgentState(subAgentStates.get(id), event.data.event, event.timestamp));
      if (tool?.id === id) {
        upsertToolBlock(tool, false);
      } else {
        const existingIndex = displayBlocks.findIndex((item) => item.id === id);
        const existing = displayBlocks[existingIndex];
        if (existing?.type === "sub-agent") {
          displayBlocks[existingIndex] = {
            ...existing,
            state: subAgentStates.get(id)!,
            ...(subAgentStates.get(id)!.status !== "running" ? { isFrozen: true as const } : {}),
          };
        }
      }
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

function toolDisplayBlockId(event: ToolExecutionEvent): string {
  return `${event.turnId ?? event.runId}:${event.data.toolCallId}`;
}

function toolBlockFromDraft(
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

function updateSubAgentState(
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
    return {
      ...base,
      toolCalls: base.toolCalls.map((call) =>
        call.toolCallId === event.toolCallId
          ? { ...call, toolName: event.toolName, toolArgs: event.toolArgs, status }
          : call
      ),
      parts: base.parts.map((part) =>
        part.type === "tool-call" && part.toolCallId === event.toolCallId
          ? { ...part, toolName: event.toolName, toolArgs: event.toolArgs, status }
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

function appendTextPart(parts: ProjectedSubAgent["parts"], delta: string): ProjectedSubAgent["parts"] {
  const last = parts.at(-1);
  if (last?.type === "text") {
    return [...parts.slice(0, -1), { type: "text", text: `${last.text}${delta}` }];
  }
  return [...parts, { type: "text", text: delta }];
}

function latestLine(text: string): string {
  return text.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}
