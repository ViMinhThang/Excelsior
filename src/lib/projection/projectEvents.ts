import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock } from "./display.js";
import { ReadModel } from "./readModel.js";
import { buildSubAgentBlock } from "./projectChildren.js";
import { CHILD_RUN_ATTACHED, RUN_START, RUN_END, USER_INPUT, TEXT_DELTA, TOOL_CALL_START, TOOL_CALL_END, ERROR, TURN_COMPLETE } from "../runtime/eventNames.js";

interface PendingTool {
  toolName: string;
  toolArgs: string;
  toolCallId: string;
  status: "pending" | "completed" | "error";
  result: string;
  isSubAgent: boolean;
}

interface PendingAssistant {
  id: string;
  fullText: string;
  timestamp: string;
}

export interface ProjectionReducerState {
  blocks: ProjectedBlock[];
  pendingAssistant: PendingAssistant | null;
  pendingTool: PendingTool | null;
  childRunIdByToolCallId: Map<string, { childRunId: string; role: string }>;
}

export interface ProjectOptions {
  getChildEvents?: (childRunId: string) => readonly AnyAgentEvent[];
}

export function createProjectionState(): ProjectionReducerState {
  return {
    blocks: [],
    pendingAssistant: null,
    pendingTool: null,
    childRunIdByToolCallId: new Map(),
  };
}

function flushAssistant(state: ProjectionReducerState, forceFrozen = true): ProjectionReducerState {
  if (!state.pendingAssistant) return state;
  return {
    ...state,
    pendingAssistant: null,
    blocks: [
      ...state.blocks,
      {
        type: "assistant",
        id: state.pendingAssistant.id,
        content: state.pendingAssistant.fullText,
        timestamp: state.pendingAssistant.timestamp,
        ...(forceFrozen ? { isFrozen: true as const } : {}),
      },
    ],
  };
}

function flushRegularTool(state: ProjectionReducerState): ProjectionReducerState {
  const isTerminal = state.pendingTool!.status !== "pending";
  return {
    ...state,
    pendingTool: null,
    blocks: [
      ...state.blocks,
      {
        type: "tool-call",
        id: state.pendingTool!.toolCallId,
        toolName: state.pendingTool!.toolName,
        toolArgs: state.pendingTool!.toolArgs,
        status: state.pendingTool!.status,
        content: state.pendingTool!.result,
        timestamp: "",
        ...(isTerminal ? { isFrozen: true as const } : {}),
      },
    ],
  };
}

function flushSubAgentTool(state: ProjectionReducerState, options?: ProjectOptions): ProjectionReducerState {
  const childInfo = state.childRunIdByToolCallId.get(state.pendingTool!.toolCallId);
  const childEvents =
    childInfo && options?.getChildEvents
      ? options.getChildEvents(childInfo.childRunId)
      : [];

  let role = "SubAgent";
  try {
    const parsed = JSON.parse(state.pendingTool!.toolArgs);
    role = parsed.role || role;
  } catch {}
  if (childInfo) {
    role = childInfo.role || role;
  }

  const derivedStatus =
    state.pendingTool!.status === "completed" ? "done"
      : state.pendingTool!.status === "error" ? "error"
      : "running";

  const subBlock = buildSubAgentBlock(state.pendingTool!.toolCallId, role, childEvents, derivedStatus);
  if (subBlock) {
    return { ...state, pendingTool: null, blocks: [...state.blocks, subBlock] };
  }

  return flushRegularTool(state);
}

function applyResultToSubAgentBlock(
  block: Extract<ProjectedBlock, { type: "sub-agent" }>,
  result: string,
  status: "completed" | "error",
  timestamp: string,
): Extract<ProjectedBlock, { type: "sub-agent" }> {
  const nextStatus = status === "error" ? "error" : "done";
  const endTime = timestamp ? new Date(timestamp).getTime() : Date.now();

  if (block.state.fullOutput || !result) {
    return {
      ...block,
      isFrozen: true,
      state: { ...block.state, status: nextStatus, endTime },
    };
  }

  const lines = result.split("\n").filter(Boolean);
  return {
    ...block,
    isFrozen: true,
    state: {
      ...block.state,
      status: nextStatus,
      fullOutput: result,
      latestLine: lines[lines.length - 1] ?? "",
      parts: [{ type: "text", text: result }],
      endTime,
    },
  };
}

function updateExistingToolResult(
  state: ProjectionReducerState,
  toolCallId: string,
  status: "completed" | "error",
  result: string,
  timestamp: string,
): ProjectionReducerState | null {
  let changed = false;
  const blocks = state.blocks.map((block) => {
    if (block.id !== toolCallId) return block;
    changed = true;

    if (block.type === "sub-agent") {
      return applyResultToSubAgentBlock(block, result, status, timestamp);
    }

    if (block.type === "tool-call") {
      return {
        ...block,
        status,
        content: result,
        timestamp: timestamp || block.timestamp,
        isFrozen: true as const,
      };
    }

    return block;
  });

  return changed ? { ...state, blocks } : null;
}

function flushTool(state: ProjectionReducerState, options?: ProjectOptions): ProjectionReducerState {
  if (!state.pendingTool) return state;
  if (state.pendingTool.isSubAgent) return flushSubAgentTool(state, options);
  return flushRegularTool(state);
}

function flushAll(
  state: ProjectionReducerState,
  options?: ProjectOptions,
  forceFrozen = true,
): ProjectionReducerState {
  return flushTool(flushAssistant(state, forceFrozen), options);
}

function handleChildRunAttached(state: ProjectionReducerState, evt: AnyAgentEvent): ProjectionReducerState {
  const data = evt.data as any;
  const next = new Map(state.childRunIdByToolCallId);
  next.set(data.parentToolCallId, { childRunId: data.childRunId, role: data.role });
  return { ...state, childRunIdByToolCallId: next };
}

function handleUserInput(state: ProjectionReducerState, evt: AnyAgentEvent, options?: ProjectOptions): ProjectionReducerState {
  const s = flushAll(state, options);
  const data = evt.data as any;
  return {
    ...s,
    blocks: [
      ...s.blocks,
      { type: "user", id: evt.id, content: data.content, timestamp: evt.timestamp, isFrozen: true },
    ],
  };
}

function handleTextDelta(state: ProjectionReducerState, evt: AnyAgentEvent): ProjectionReducerState {
  const data = evt.data as any;
  if (state.pendingAssistant) {
    return {
      ...state,
      pendingAssistant: {
        ...state.pendingAssistant,
        fullText: state.pendingAssistant.fullText + data.delta,
        timestamp: evt.timestamp,
      },
    };
  }
  return {
    ...state,
    pendingAssistant: { id: evt.id, fullText: data.delta, timestamp: evt.timestamp },
  };
}

function handleToolCallStart(state: ProjectionReducerState, evt: AnyAgentEvent, options?: ProjectOptions): ProjectionReducerState {
  const s = flushAll(state, options);
  const data = evt.data as any;
  const tCallId = evt.relatedToolCallId ?? data.toolCallId;
  const isSubAgent = data.toolName === "spawnSubAgent";

  return {
    ...s,
    pendingTool: {
      toolName: data.toolName,
      toolArgs: isSubAgent ? extractSubAgentRole(data.toolArgs) : data.toolArgs,
      toolCallId: tCallId,
      status: "pending",
      result: "",
      isSubAgent,
    },
  };
}

function handleToolCallEnd(state: ProjectionReducerState, evt: AnyAgentEvent): ProjectionReducerState {
  const data = evt.data as any;
  const toolCallId = evt.relatedToolCallId ?? data.toolCallId;
  const status = data.status === "error" ? "error" as const : "completed" as const;
  const result = data.result ?? "";

  if (state.pendingTool && state.pendingTool.toolCallId === toolCallId) {
    return { ...state, pendingTool: { ...state.pendingTool, status, result } };
  }

  const updated = updateExistingToolResult(state, toolCallId, status, result, evt.timestamp);
  if (updated) return updated;

  if (data.toolName === "spawnSubAgent") {
    return state;
  }
  const s = flushAssistant(state);
  return {
    ...s,
    blocks: [
      ...s.blocks,
      {
        type: "tool-call",
        id: evt.id,
        toolName: data.toolName || "unknown",
        toolArgs: JSON.stringify(data.toolArgs ?? {}),
        status,
        content: result,
        timestamp: evt.timestamp,
        isFrozen: true,
      },
    ],
  };
}

function handleError(state: ProjectionReducerState, evt: AnyAgentEvent, options?: ProjectOptions): ProjectionReducerState {
  const s = flushAll(state, options);
  const data = evt.data as any;
  return {
    ...s,
    blocks: [
      ...s.blocks,
      {
        type: "assistant",
        id: evt.id,
        content: `Error: ${data.message ?? "Unknown error"}`,
        timestamp: evt.timestamp,
        isFrozen: true,
      },
    ],
  };
}

function extractSubAgentRole(toolArgs: string): string {
  try {
    const parsed = JSON.parse(toolArgs);
    return JSON.stringify({ role: parsed.role ?? toolArgs });
  } catch {
    return toolArgs;
  }
}

export function reduceProjectionEvent(
  state: ProjectionReducerState,
  evt: AnyAgentEvent,
  options?: ProjectOptions,
): ProjectionReducerState {
  switch (evt.type) {
    case CHILD_RUN_ATTACHED:
      return handleChildRunAttached(state, evt);
    case USER_INPUT:
      return handleUserInput(state, evt, options);
    case TEXT_DELTA:
      return handleTextDelta(state, evt);
    case TOOL_CALL_START:
      return handleToolCallStart(state, evt, options);
    case TOOL_CALL_END:
      return handleToolCallEnd(state, evt);
    case ERROR:
      return handleError(state, evt, options);
    case RUN_START:
    case TURN_COMPLETE:
      return state;
    case RUN_END:
      return flushAll(state, options);
  }
}

export function flushProjectionState(
  state: ProjectionReducerState,
  options?: ProjectOptions,
): ProjectedBlock[] {
  return flushAll(state, options, false).blocks;
}

export function groupEventsForDisplay(
  events: readonly AnyAgentEvent[],
  options?: ProjectOptions,
): ProjectedBlock[] {
  const state = events.reduce(
    (s, evt) => reduceProjectionEvent(s, evt, options),
    createProjectionState(),
  );
  return flushProjectionState(state, options);
}

export const CHAT_TRANSCRIPT_MODEL: ReadModel<ProjectionReducerState, AnyAgentEvent> = {
  initialState: createProjectionState,
  apply(state, event) {
    return reduceProjectionEvent(state, event);
  },
};
