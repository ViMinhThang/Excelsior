import { AnyAgentEvent } from "../runtime/events.js";
import { DisplayBlock, SubAgentDisplayState, SubAgentPart } from "./display.js";
import { ToolCallInfo } from "../../types.js";
import { ReadModel } from "./readModel.js";

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
  blocks: DisplayBlock[];
  pendingAssistant: PendingAssistant | null;
  pendingTool: PendingTool | null;
  childSessionIdByToolCallId: Map<string, { childSessionId: string; role: string }>;
}

export interface ProjectOptions {
  getChildEvents?: (childSessionId: string) => readonly AnyAgentEvent[];
}

export function createProjectionState(): ProjectionReducerState {
  return {
    blocks: [],
    pendingAssistant: null,
    pendingTool: null,
    childSessionIdByToolCallId: new Map(),
  };
}

function flushAssistant(state: ProjectionReducerState, forceFrozen = true): void {
  if (state.pendingAssistant) {
    state.blocks.push({
      type: "assistant",
      id: state.pendingAssistant.id,
      content: state.pendingAssistant.fullText,
      timestamp: state.pendingAssistant.timestamp,
      ...(forceFrozen ? { isFrozen: true as const } : {}),
    });
    state.pendingAssistant = null;
  }
}

function flushTool(state: ProjectionReducerState, options?: ProjectOptions): void {
  if (!state.pendingTool) return;

  if (state.pendingTool.isSubAgent) {
    const childInfo = state.childSessionIdByToolCallId.get(state.pendingTool.toolCallId);
    const childEvents =
      childInfo && options?.getChildEvents
        ? options.getChildEvents(childInfo.childSessionId)
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
      state.blocks.push(subBlock);
      state.pendingTool = null;
      return;
    }
  }

  const isTerminal = state.pendingTool.status !== "pending";
  state.blocks.push({
    type: "tool-call",
    id: state.pendingTool.toolCallId,
    toolName: state.pendingTool.toolName,
    toolArgs: state.pendingTool.toolArgs,
    status: state.pendingTool.status,
    content: state.pendingTool.result,
    timestamp: "",
    ...(isTerminal ? { isFrozen: true as const } : {}),
  });
  state.pendingTool = null;
}

export function reduceProjectionEvent(
  state: ProjectionReducerState,
  evt: AnyAgentEvent,
  options?: ProjectOptions,
): void {
  switch (evt.type) {
    case "child-session-attached": {
      const { childSessionId, parentToolCallId, role } = evt.data;
      state.childSessionIdByToolCallId.set(parentToolCallId, { childSessionId, role });
      break;
    }

    case "user-input": {
      flushAssistant(state);
      flushTool(state, options);
      state.blocks.push({
        type: "user",
        id: evt.id,
        content: evt.data.content,
        timestamp: evt.timestamp,
        isFrozen: true,
      });
      break;
    }

    case "text-delta": {
      const delta = evt.data.delta;
      if (state.pendingAssistant) {
        state.pendingAssistant.fullText += delta;
        state.pendingAssistant.timestamp = evt.timestamp;
      } else {
        state.pendingAssistant = {
          id: evt.id,
          fullText: delta,
          timestamp: evt.timestamp,
        };
      }
      break;
    }

    case "tool-call-start": {
      flushAssistant(state);
      flushTool(state, options);
      const { toolName, toolArgs, toolCallId } = evt.data;
      const tCallId = evt.relatedToolCallId ?? toolCallId;
      const isSubAgent = toolName === "spawnSubAgent";

      state.pendingTool = {
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
      };
      break;
    }

    case "tool-call-end": {
      const toolCallId = evt.relatedToolCallId ?? evt.data.toolCallId;
      const result = evt.data.result;
      const status = evt.data.status === "error" ? "error" as const : "completed" as const;
      const toolName = evt.data.toolName;

      if (state.pendingTool && state.pendingTool.toolCallId === toolCallId) {
        state.pendingTool.status = status;
        state.pendingTool.result = result ?? "";
        flushTool(state, options);
      } else if (toolName === "spawnSubAgent") {
        // Orphaned: tool already consumed
      } else {
        flushAssistant(state);
        state.blocks.push({
          type: "tool-call",
          id: evt.id,
          toolName: toolName || "unknown",
          toolArgs: parseToolArgs(evt.data.toolArgs),
          status,
          content: result ?? "",
          timestamp: evt.timestamp,
          isFrozen: true,
        });
      }
      break;
    }

    case "error": {
      flushAssistant(state);
      flushTool(state, options);
      state.blocks.push({
        type: "assistant",
        id: evt.id,
        content: `Error: ${evt.data.message ?? "Unknown error"}`,
        timestamp: evt.timestamp,
        isFrozen: true,
      });
      break;
    }

    case "session-start":
      break;
    case "session-end":
      flushAssistant(state);
      flushTool(state, options);
      break;
  }
}

export function flushProjectionState(
  state: ProjectionReducerState,
  options?: ProjectOptions,
): DisplayBlock[] {
  flushAssistant(state, false);
  flushTool(state, options);
  return state.blocks;
}

export function groupEventsForDisplay(
  events: readonly AnyAgentEvent[],
  options?: ProjectOptions,
): DisplayBlock[] {
  const state = createProjectionState();
  for (const evt of events) {
    reduceProjectionEvent(state, evt, options);
  }
  return flushProjectionState(state, options);
}

function buildSubAgentBlock(
  toolCallId: string,
  childRole: string,
  childEvents: readonly AnyAgentEvent[],
  status: "running" | "done" | "error",
): DisplayBlock | null {
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
): SubAgentDisplayState {
  const parts: SubAgentPart[] = [];
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
          const last = parts[partsLen - 1] as SubAgentPart & { type: "text" };
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

export function projectEventsToAIHistory(
  events: readonly AnyAgentEvent[],
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  let assistantBuf = "";

  function flushAssistant() {
    if (assistantBuf) {
      history.push({ role: "assistant", content: assistantBuf });
      assistantBuf = "";
    }
  }

  for (const evt of events) {
    switch (evt.type) {
      case "user-input":
        flushAssistant();
        history.push({ role: "user", content: evt.data.content });
        break;
      case "text-delta":
        assistantBuf += evt.data.delta;
        break;
      case "tool-call-start":
      case "tool-call-end":
        flushAssistant();
        if (evt.type === "tool-call-end") {
          const { result, toolName, toolArgs, status } = evt.data;
          const isError = status === "error" || result?.startsWith("[Error]");
          const label = isError ? "[Error]" : "[Completed]";
          history.push({
            role: "assistant",
            content: `[Tool: ${toolName}(${toolArgs})] ${label}\n${result ?? ""}`,
          });
        }
        break;
      case "error":
        flushAssistant();
        history.push({
          role: "assistant",
          content: `[Error] ${evt.data.message}`,
        });
        break;
      case "child-session-attached":
      case "session-start":
      case "session-end":
        flushAssistant();
        break;
    }
  }
  flushAssistant();
  return history;
}

export const chatTranscriptModel: ReadModel<ProjectionReducerState, AnyAgentEvent> = {
  initialState: createProjectionState,
  apply(state, event) {
    reduceProjectionEvent(state, event);
    return state;
  },
};

export type AIHistoryMessage = { role: "user" | "assistant" | "system"; content: string };

export const aiHistoryModel: ReadModel<AIHistoryMessage[], AnyAgentEvent> = {
  initialState: () => [],
  apply(history, event) {
    let assistantBuf = "";
    const last = history[history.length - 1];
    if (last?.role === "assistant" && !last.content.startsWith("[Tool:") && !last.content.startsWith("[Error]")) {
      assistantBuf = last.content;
      history.pop();
    }
    switch (event.type) {
      case "user-input":
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        history.push({ role: "user", content: event.data.content });
        break;
      case "text-delta":
        assistantBuf += event.data.delta;
        break;
      case "tool-call-end": {
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        assistantBuf = "";
        const { result, toolName, toolArgs, status } = event.data;
        const isError = status === "error" || result?.startsWith("[Error]");
        const label = isError ? "[Error]" : "[Completed]";
        history.push({
          role: "assistant",
          content: `[Tool: ${toolName}(${toolArgs})] ${label}\n${result ?? ""}`,
        });
        break;
      }
      case "error":
        if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
        assistantBuf = "";
        history.push({ role: "assistant", content: `[Error] ${event.data.message}` });
        break;
      case "tool-call-start":
      case "child-session-attached":
      case "session-start":
      case "session-end":
        break;
    }
    if (assistantBuf) history.push({ role: "assistant", content: assistantBuf });
    return history;
  },
};
