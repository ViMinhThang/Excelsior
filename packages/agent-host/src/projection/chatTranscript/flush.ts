import {
  getStringToolArg,
  normalizeSubAgentToolArgs,
  parseToolArgs,
  type ProjectedBlock,
} from "@excelsior/core";
import { buildSubAgentBlock } from "../subAgent/model.js";
import type {
  ChatTranscriptProjectionContext,
  ChatTranscriptProjectionState,
  PendingTool,
} from "./state.js";

type SubAgentBlock = Extract<ProjectedBlock, { type: "sub-agent" }>;

export function flushAssistant(
  state: ChatTranscriptProjectionState,
  forceFrozen = true,
): ChatTranscriptProjectionState {
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

function flushRegularTool(
  state: ChatTranscriptProjectionState,
  tool: PendingTool,
): ChatTranscriptProjectionState {
  const isTerminal = tool.status !== "pending";
  return {
    ...state,
    pendingTool: null,
    blocks: [
      ...state.blocks,
      {
        type: "tool-call",
        id: tool.toolCallId,
        toolName: tool.toolName,
        toolArgs: tool.toolArgs,
        status: tool.status,
        content: tool.result,
        timestamp: "",
        ...(isTerminal ? { isFrozen: true as const } : {}),
      },
    ],
  };
}

function resolveSubAgentRole(
  tool: PendingTool,
  childInfo: { childRunId: string; role: string } | undefined,
): string {
  const role = getStringToolArg(parseToolArgs(tool.toolArgs), "role") || "SubAgent";
  return childInfo?.role || role;
}

function flushSubAgentTool(
  state: ChatTranscriptProjectionState,
  tool: PendingTool,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  const childInfo = state.childRunIdByToolCallId.get(tool.toolCallId);
  const childEvents =
    childInfo && context?.getChildEvents
      ? context.getChildEvents(childInfo.childRunId)
      : [];
  const derivedStatus =
    tool.status === "completed"
      ? "done"
      : tool.status === "error"
        ? "error"
        : "running";

  const subBlock = buildSubAgentBlock(
    tool.toolCallId,
    resolveSubAgentRole(tool, childInfo),
    childEvents,
    derivedStatus,
  );
  return { ...state, pendingTool: null, blocks: [...state.blocks, subBlock] };
}

function applyResultToSubAgentBlock(
  block: SubAgentBlock,
  result: string,
  status: "completed" | "error",
  timestamp: string,
): SubAgentBlock {
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

export function updateExistingToolResult(
  state: ChatTranscriptProjectionState,
  toolCallId: string,
  status: "completed" | "error",
  result: string,
  timestamp: string,
): ChatTranscriptProjectionState | null {
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

export function flushTool(
  state: ChatTranscriptProjectionState,
  context?: ChatTranscriptProjectionContext,
): ChatTranscriptProjectionState {
  if (!state.pendingTool) return state;
  if (state.pendingTool.isSubAgent) {
    return flushSubAgentTool(state, state.pendingTool, context);
  }
  return flushRegularTool(state, state.pendingTool);
}

export function flushAll(
  state: ChatTranscriptProjectionState,
  context?: ChatTranscriptProjectionContext,
  forceFrozen = true,
): ChatTranscriptProjectionState {
  return flushAssistant(flushTool(state, context), forceFrozen);
}

export function finalizeChatTranscriptProjection(
  state: ChatTranscriptProjectionState,
  context?: ChatTranscriptProjectionContext,
): ProjectedBlock[] {
  return flushAll(state, context, false).blocks;
}

export function extractSubAgentRole(toolArgs: string): string {
  return normalizeSubAgentToolArgs(toolArgs);
}
