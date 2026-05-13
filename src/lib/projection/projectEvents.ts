// Invariant: Events must be consumed in causal order.
//   text-delta must come before its associated tool-call-start
//   tool-call-start must come before its associated tool-call-end
//   child-run-attached must occur before any child output events
// Invariant: All projection functions are externally pure (return new state).
//   Internally they use structural sharing via spread syntax, not deep cloning.

import { AnyAgentEvent } from "../runtime/events.js";
import { ProjectedBlock } from "./display.js";
import { ReadModel } from "./readModel.js";
import { buildSubAgentBlock } from "./projectChildren.js";
import { CHILD_RUN_ATTACHED, RUN_START, RUN_END, USER_INPUT, TEXT_DELTA, TOOL_CALL_START, TOOL_CALL_END, ERROR } from "../runtime/event-names.js";

function parseToolArgs(args?: unknown): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

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

function cloneMap(m: Map<string, { childRunId: string; role: string }>): Map<string, { childRunId: string; role: string }> {
  return new Map(m);
}

function flushTool(state: ProjectionReducerState, options?: ProjectOptions): ProjectionReducerState {
  if (!state.pendingTool) return state;

  if (state.pendingTool.isSubAgent) {
    const childInfo = state.childRunIdByToolCallId.get(state.pendingTool.toolCallId);
    const childEvents =
      childInfo && options?.getChildEvents
        ? options.getChildEvents(childInfo.childRunId)
        : [];

    let role = "SubAgent";
    try {
      const parsed = JSON.parse(state.pendingTool.toolArgs);
      role = parsed.role || role;
    } catch {
      // ignore
    }
    if (childInfo) {
      role = childInfo.role || role;
    }

    const derivedStatus =
      state.pendingTool.status === "completed" ? "done"
        : state.pendingTool.status === "error" ? "error"
        : "running";

    const subBlock = buildSubAgentBlock(
      state.pendingTool.toolCallId,
      role,
      childEvents,
      derivedStatus,
    );

    if (subBlock) {
      return {
        ...state,
        pendingTool: null,
        blocks: [...state.blocks, subBlock],
      };
    }
  }

  const isTerminal = state.pendingTool.status !== "pending";
  return {
    ...state,
    pendingTool: null,
    blocks: [
      ...state.blocks,
      {
        type: "tool-call",
        id: state.pendingTool.toolCallId,
        toolName: state.pendingTool.toolName,
        toolArgs: state.pendingTool.toolArgs,
        status: state.pendingTool.status,
        content: state.pendingTool.result,
        timestamp: "",
        ...(isTerminal ? { isFrozen: true as const } : {}),
      },
    ],
  };
}

export function reduceProjectionEvent(
  state: ProjectionReducerState,
  evt: AnyAgentEvent,
  options?: ProjectOptions,
): ProjectionReducerState {
  switch (evt.type) {
    case CHILD_RUN_ATTACHED: {
      const { childRunId, parentToolCallId, role } = evt.data;
      const next = cloneMap(state.childRunIdByToolCallId);
      next.set(parentToolCallId, { childRunId, role });
      return { ...state, childRunIdByToolCallId: next };
    }

    case USER_INPUT: {
      const s = flushTool(flushAssistant(state), options);
      return {
        ...s,
        blocks: [
          ...s.blocks,
          {
            type: "user",
            id: evt.id,
            content: evt.data.content,
            timestamp: evt.timestamp,
            isFrozen: true,
          },
        ],
      };
    }

    case TEXT_DELTA: {
      if (state.pendingAssistant) {
        return {
          ...state,
          pendingAssistant: {
            ...state.pendingAssistant,
            fullText: state.pendingAssistant.fullText + evt.data.delta,
            timestamp: evt.timestamp,
          },
        };
      }
      return {
        ...state,
        pendingAssistant: {
          id: evt.id,
          fullText: evt.data.delta,
          timestamp: evt.timestamp,
        },
      };
    }

    case TOOL_CALL_START: {
      const s = flushTool(flushAssistant(state), options);
      const { toolName, toolArgs, toolCallId } = evt.data;
      const tCallId = evt.relatedToolCallId ?? toolCallId;
      const isSubAgent = toolName === "spawnSubAgent";

      return {
        ...s,
        pendingTool: {
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
          toolCallId: tCallId,
          status: "pending",
          result: "",
          isSubAgent,
        },
      };
    }

    case TOOL_CALL_END: {
      const toolCallId = evt.relatedToolCallId ?? evt.data.toolCallId;
      const result = evt.data.result;
      const status = evt.data.status === "error" ? "error" as const : "completed" as const;
      const toolName = evt.data.toolName;

      if (state.pendingTool && state.pendingTool.toolCallId === toolCallId) {
        return flushTool(
          { ...state, pendingTool: { ...state.pendingTool, status, result: result ?? "" } },
          options,
        );
      }
      if (toolName === "spawnSubAgent") {
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
            toolName: toolName || "unknown",
            toolArgs: parseToolArgs(evt.data.toolArgs),
            status,
            content: result ?? "",
            timestamp: evt.timestamp,
            isFrozen: true,
          },
        ],
      };
    }

    case ERROR: {
      const s = flushTool(flushAssistant(state), options);
      return {
        ...s,
        blocks: [
          ...s.blocks,
          {
            type: "assistant",
            id: evt.id,
            content: `Error: ${evt.data.message ?? "Unknown error"}`,
            timestamp: evt.timestamp,
            isFrozen: true,
          },
        ],
      };
    }

    case RUN_START:
      return state;
    case RUN_END:
      return flushTool(flushAssistant(state), options);
  }
}

export function flushProjectionState(
  state: ProjectionReducerState,
  options?: ProjectOptions,
): ProjectedBlock[] {
  return flushTool(flushAssistant(state, false), options).blocks;
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

export const chatTranscriptModel: ReadModel<ProjectionReducerState, AnyAgentEvent> = {
  initialState: createProjectionState,
  apply(state, event) {
    return reduceProjectionEvent(state, event);
  },
};
