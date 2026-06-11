import type { AgentMessage, ProjectedBlock, ProjectedSubAgent, ProjectedTurn } from "@excelsior/core";
import {
  SUB_AGENT_EVENT,
  type AnyHarnessEvent,
  type HarnessMessage,
} from "../events.js";
import type { ProjectionState, AssistantDraft, ToolDraft } from "./types.js";

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
  try {
    const parsed = JSON.parse(rawArgs) as { role?: unknown };
    return typeof parsed.role === "string" && parsed.role.trim()
      ? parsed.role
      : "SubAgent";
  } catch {
    return rawArgs || "SubAgent";
  }
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
    return [...parts.slice(0, -1), { type: "text", text: `${last.text}${delta}` }];
  }
  return [...parts, { type: "text", text: delta }];
}

export function latestLine(text: string): string {
  return text.split(/\r?\n/).filter(Boolean).at(-1) ?? "";
}

export function upsertSnapshotBlock(blocks: ProjectedBlock[], block: ProjectedBlock): ProjectedBlock[] {
  const existingIndex = blocks.findIndex((item) => item.id === block.id);
  if (existingIndex === -1) return [...blocks, block];
  const next = [...blocks];
  next[existingIndex] = block;
  return next;
}

export function nextDisplayBlockId(id: string, displayIdCounts: Map<string, number>): string {
  const count = displayIdCounts.get(id) ?? 0;
  displayIdCounts.set(id, count + 1);
  return count === 0 ? id : `${id}:${count + 1}`;
}

export function ensureTurn(state: ProjectionState, turnId?: string, timestamp?: string): ProjectedTurn {
  const id = turnId || state.currentTurnId || `turn_${Date.now()}`;
  let turn = state.turns.find((t) => t.id === id);
  if (!turn) {
    turn = {
      id,
      status: "in-progress",
      blocks: [],
      startTime: timestamp || new Date().toISOString(),
    };
    state.turns.push(turn);
  }
  if (!state.currentTurnId) {
    state.currentTurnId = id;
  }
  return turn;
}

export function upsertBlockInTurn(state: ProjectionState, turnId: string | undefined, block: ProjectedBlock): void {
  const turn = ensureTurn(state, turnId, block.timestamp);
  const existingIndex = turn.blocks.findIndex((b) => b.id === block.id);
  if (existingIndex === -1) {
    turn.blocks.push(block);
  } else {
    turn.blocks[existingIndex] = block;
  }
}

export function upsertToolBlock(state: ProjectionState, draft: ToolDraft, forceFrozen?: boolean): void {
  const block = toolBlockFromDraft(draft, forceFrozen, state.subAgentStates.get(draft.id));
  const turnId = draft.id.split(":")[0];
  upsertBlockInTurn(state, turnId, block);
}

export function upsertReasoningBlock(
  state: ProjectionState,
  draft: AssistantDraft,
  forceFrozen?: boolean,
  turnId?: string,
): void {
  const block: ProjectedBlock = {
    type: "reasoning",
    id: draft.id,
    content: draft.content,
    timestamp: draft.timestamp,
    ...(forceFrozen || draft.frozen ? { isFrozen: true as const } : {}),
  };
  upsertBlockInTurn(state, turnId, block);
}

export function flushAssistant(state: ProjectionState, forceFrozen?: boolean, turnId?: string): void {
  if (!state.assistant) return;
  if (state.assistant.content.trim()) {
    const block: ProjectedBlock = {
      type: "assistant",
      id: nextDisplayBlockId(state.assistant.id, state.displayIdCounts),
      content: state.assistant.content,
      timestamp: state.assistant.timestamp,
      ...(forceFrozen || state.assistant.frozen ? { isFrozen: true as const } : {}),
    };
    upsertBlockInTurn(state, turnId, block);
  }
  state.assistant = null;
}

export function flushTool(state: ProjectionState, forceFrozen?: boolean): void {
  if (!state.tool) return;
  upsertToolBlock(state, state.tool, forceFrozen);
  state.tool = null;
}

export function flushReasoning(state: ProjectionState, forceFrozen?: boolean, turnId?: string): void {
  if (!state.reasoning) return;
  upsertReasoningBlock(state, state.reasoning, forceFrozen, turnId);
  state.reasoning = null;
}

export function flushAll(state: ProjectionState, forceFrozen?: boolean, turnId?: string): void {
  flushAssistant(state, forceFrozen, turnId);
  flushTool(state, forceFrozen);
  flushReasoning(state, forceFrozen, turnId);
}
