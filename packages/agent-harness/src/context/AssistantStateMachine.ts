import { randomUUID } from "node:crypto";
import type { AgentMessage, ProjectedBlock, ProjectedSubAgent } from "@excelsior/core";
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
  makeHarnessEvent,
  type AnyHarnessEvent,
  type HarnessEventEmitter,
  type HarnessMessage,
} from "../events.js";

const TOOL_INPUT_UPDATE_INTERVAL_MS = 250;
const TOOL_INPUT_UPDATE_CHARS = 2048;

type ToolExecutionEvent = Extract<
  AnyHarnessEvent,
  { type: typeof TOOL_EXECUTION_START | typeof TOOL_EXECUTION_UPDATE | typeof TOOL_EXECUTION_END }
>;

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

export class AssistantStateMachine {
  private displayBlocks: ProjectedBlock[] = [];
  private aiHistory: AgentMessage[] = [];
  private displayIdCounts = new Map<string, number>();
  private assistant: AssistantDraft | null = null;
  private tool: ToolDraft | null = null;
  private subAgentStates = new Map<string, ProjectedSubAgent>();

  // Tracks active inputs and execution progress
  private toolInputs = new Map<string, { toolName: string; toolArgs: string }>();
  private toolInputBuffers = new Map<string, { toolName: string; delta: string; lastEmittedAt: number }>();
  private startedTools = new Set<string>();
  private completedTools = new Set<string>();

  constructor(private readonly emit?: HarnessEventEmitter) {}

  // --- Active Stream Modifiers (called by RunController) ---

  startMessage(id = `msg_${randomUUID()}`): void {
    if (this.assistant) return;
    const event = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: MESSAGE_START,
      data: {
        message: {
          id,
          role: "assistant",
          content: "",
        },
      },
    });

    if (this.emit) {
      this.emit(MESSAGE_START, event.data);
    }
    this.applyEvent(event);
  }

  updateMessage(id: string, delta: string): void {
    this.startMessage(id);
    const event = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: MESSAGE_UPDATE,
      data: {
        messageId: this.assistant?.id ?? id,
        role: "assistant",
        delta,
        content: (this.assistant?.content ?? "") + delta,
      },
    });

    if (this.emit) {
      this.emit(MESSAGE_UPDATE, event.data);
    }
    this.applyEvent(event);
  }

  endMessage(expectedId?: string): void {
    if (!this.assistant) return;
    const id = this.assistant.id;
    const content = this.assistant.content;
    if (expectedId && expectedId !== id && !content.trim()) return;

    const event = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: MESSAGE_END,
      data: {
        message: {
          id,
          role: "assistant",
          content,
        },
      },
    });

    if (this.emit) {
      this.emit(MESSAGE_END, event.data);
    }
    this.applyEvent(event);
  }

  startTool(callId: string, toolName: string): void {
    this.endMessage();

    const event = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: TOOL_EXECUTION_START,
      data: {
        toolCallId: callId,
        toolName,
        toolArgs: "",
      },
    });

    if (this.emit) {
      this.emit(TOOL_EXECUTION_START, event.data, { relatedToolCallId: callId });
    }
    this.applyEvent(event);

    this.startedTools.add(callId);
    this.toolInputs.set(callId, { toolName, toolArgs: "" });
    this.toolInputBuffers.set(callId, {
      toolName,
      delta: "",
      lastEmittedAt: Date.now(),
    });
  }

  updateToolInput(callId: string, delta: string): void {
    const input = this.toolInputs.get(callId);
    if (input) {
      input.toolArgs += delta;
    }

    const buffer = this.toolInputBuffers.get(callId);
    if (!buffer) return;

    const now = Date.now();
    buffer.delta += delta;

    if (
      buffer.delta.length >= TOOL_INPUT_UPDATE_CHARS ||
      now - buffer.lastEmittedAt >= TOOL_INPUT_UPDATE_INTERVAL_MS
    ) {
      this.flushToolInput(callId, now);
    }
  }

  private flushToolInput(callId: string, now = Date.now()): void {
    const buffer = this.toolInputBuffers.get(callId);
    if (!buffer || !buffer.delta) return;

    const event = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: TOOL_EXECUTION_UPDATE,
      data: {
        toolCallId: callId,
        toolName: buffer.toolName,
        delta: buffer.delta,
      },
    });

    if (this.emit) {
      this.emit(TOOL_EXECUTION_UPDATE, event.data, { relatedToolCallId: callId });
    }
    this.applyEvent(event);

    buffer.delta = "";
    buffer.lastEmittedAt = now;
  }

  flushAllToolUpdates(): void {
    for (const callId of this.toolInputBuffers.keys()) {
      this.flushToolInput(callId);
    }
  }

  endToolInput(callId: string, finalInput?: unknown): string {
    const input = this.toolInputs.get(callId);
    const toolName = input?.toolName ?? "tool";
    const toolArgs = stringifyToolArgs(finalInput ?? input?.toolArgs);

    if (input) {
      input.toolArgs = toolArgs;
    }

    this.flushToolInput(callId);
    this.toolInputBuffers.delete(callId);

    if (!this.startedTools.has(callId)) {
      this.startedTools.add(callId);
      const startEvent = makeHarnessEvent({
        workspaceId: "placeholder",
        sessionId: "placeholder",
        runId: "placeholder",
        sequence: 0,
        type: TOOL_EXECUTION_START,
        data: {
          toolCallId: callId,
          toolName,
          toolArgs,
        },
      });

      if (this.emit) {
        this.emit(TOOL_EXECUTION_START, startEvent.data, { relatedToolCallId: callId });
      }
      this.applyEvent(startEvent);
    }

    return toolArgs;
  }

  completeTool(callId: string, toolArgs: string, resultText: string, isError: boolean): void {
    const input = this.toolInputs.get(callId);
    const toolName = input?.toolName ?? "tool";

    if (!this.startedTools.has(callId)) {
      this.startedTools.add(callId);
      const startEvent = makeHarnessEvent({
        workspaceId: "placeholder",
        sessionId: "placeholder",
        runId: "placeholder",
        sequence: 0,
        type: TOOL_EXECUTION_START,
        data: {
          toolCallId: callId,
          toolName,
          toolArgs,
        },
      });
      if (this.emit) {
        this.emit(TOOL_EXECUTION_START, startEvent.data, { relatedToolCallId: callId });
      }
      this.applyEvent(startEvent);
    }

    const endEvent = makeHarnessEvent({
      workspaceId: "placeholder",
      sessionId: "placeholder",
      runId: "placeholder",
      sequence: 0,
      type: TOOL_EXECUTION_END,
      data: {
        toolCallId: callId,
        toolName,
        toolArgs,
        result: resultText,
        isError,
      },
    });

    if (this.emit) {
      this.emit(TOOL_EXECUTION_END, endEvent.data, { relatedToolCallId: callId });
      emitToolMessage(this.emit, callId, toolName, toolArgs, resultText, isError);
    }
    this.applyEvent(endEvent);
    this.completedTools.add(callId);
  }

  finalizeIncompleteTools(resultText: string): void {
    for (const toolCallId of this.startedTools) {
      if (this.completedTools.has(toolCallId)) continue;
      const toolInput = this.toolInputs.get(toolCallId);
      const toolName = toolInput?.toolName ?? "tool";
      const toolArgs = toolInput?.toolArgs ?? "{}";

      const event = makeHarnessEvent({
        workspaceId: "placeholder",
        sessionId: "placeholder",
        runId: "placeholder",
        sequence: 0,
        type: TOOL_EXECUTION_END,
        data: {
          toolCallId,
          toolName,
          toolArgs,
          result: resultText,
          isError: true,
        },
      });

      if (this.emit) {
        this.emit(TOOL_EXECUTION_END, event.data, { relatedToolCallId: toolCallId });
        emitToolMessage(this.emit, toolCallId, toolName, toolArgs, resultText, true);
      }
      this.applyEvent(event);
      this.completedTools.add(toolCallId);
    }
  }

  emitNotice(content: string): void {
    const id = `msg_${randomUUID()}`;
    this.startMessage(id);
    this.updateMessage(id, content);
    this.endMessage(id);
  }

  getToolName(callId: string): string | undefined {
    return this.toolInputs.get(callId)?.toolName;
  }

  getToolArgs(callId: string): string | undefined {
    return this.toolInputs.get(callId)?.toolArgs;
  }

  // --- Replay / Projection Logic (event sourced) ---

  applyEvent(event: AnyHarnessEvent): void {
    if (event.type === MESSAGE_START) {
      const message = event.data.message;
      if (message.role === "assistant") {
        this.flushTool(true);
        this.assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          frozen: false,
        };
      }
    } else if (event.type === MESSAGE_UPDATE) {
      this.flushTool(true);
      this.assistant = {
        id: event.data.messageId,
        content: event.data.content,
        timestamp: event.timestamp || new Date().toISOString(),
        frozen: false,
      };
    } else if (event.type === MESSAGE_END) {
      const message = event.data.message;
      if (message.role === "user") {
        this.flushAll(true);
        this.displayBlocks.push({
          type: "user",
          id: this.nextDisplayBlockId(message.id),
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          isFrozen: true,
        });
        this.aiHistory.push(toAgentMessage(message));
      } else if (message.role === "assistant") {
        this.flushTool(true);
        this.assistant = {
          id: message.id,
          content: message.content,
          timestamp: event.timestamp || new Date().toISOString(),
          frozen: true,
        };
        this.flushAssistant(true);
        if (message.content.trim()) this.aiHistory.push(toAgentMessage(message));
      } else if (message.role === "tool") {
        this.aiHistory.push(toAgentMessage(message));
      }
    } else if (event.type === TOOL_EXECUTION_START) {
      this.flushAssistant(true);
      this.flushTool(true);
      const id = toolDisplayBlockId(event);
      this.tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status: "pending",
        result: "",
        timestamp: event.timestamp || new Date().toISOString(),
        startTimestamp: event.timestamp || new Date().toISOString(),
      };
    } else if (event.type === TOOL_EXECUTION_UPDATE) {
      const currentTool = this.tool;
      const id = toolDisplayBlockId(event);
      if (currentTool && currentTool.id === id) {
        this.tool = {
          id: currentTool.id,
          toolName: currentTool.toolName,
          status: currentTool.status,
          result: currentTool.result,
          startTimestamp: currentTool.startTimestamp,
          endTimestamp: currentTool.endTimestamp,
          toolArgs: `${currentTool.toolArgs}${event.data.delta}`,
          timestamp: event.timestamp || new Date().toISOString(),
        };
      }
    } else if (event.type === TOOL_EXECUTION_END) {
      const status = event.data.isError ? "error" : "completed";
      const previousTool = this.tool;
      const id = toolDisplayBlockId(event);
      this.aiHistory.push({
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
      this.tool = {
        id,
        toolName: event.data.toolName,
        toolArgs: event.data.toolArgs,
        status,
        result: event.data.result,
        timestamp: event.timestamp || new Date().toISOString(),
        startTimestamp: previousTool?.id === id
          ? previousTool.startTimestamp
          : event.timestamp || new Date().toISOString(),
        endTimestamp: event.timestamp || new Date().toISOString(),
      };
      this.flushTool(true);
    } else if (event.type === SUB_AGENT_EVENT) {
      const id = `${event.turnId ?? event.runId}:${event.data.parentToolCallId}`;
      this.subAgentStates.set(
        id,
        updateSubAgentState(this.subAgentStates.get(id), event.data.event, event.timestamp || new Date().toISOString())
      );
      if (this.tool?.id === id) {
        this.upsertToolBlock(this.tool, false);
      } else {
        const existingIndex = this.displayBlocks.findIndex((item) => item.id === id);
        const existing = this.displayBlocks[existingIndex];
        if (existing?.type === "sub-agent") {
          this.displayBlocks[existingIndex] = {
            ...existing,
            state: this.subAgentStates.get(id)!,
            ...(this.subAgentStates.get(id)!.status !== "running" ? { isFrozen: true as const } : {}),
          };
        }
      }
    } else if (event.type === HISTORY_COMPACTED) {
      this.flushAll(true);
      this.aiHistory.push({
        role: "system",
        content: `Previous conversation summary:\n${event.data.summary}`,
      });
    } else if (event.type === ERROR) {
      this.flushAll(true);
      this.displayBlocks.push({
        type: "assistant",
        id: event.id,
        content: `Error: ${event.data.message}`,
        timestamp: event.timestamp || new Date().toISOString(),
        isFrozen: true,
      });
      this.aiHistory.push({ role: "assistant", content: `Error: ${event.data.message}` });
    }
  }

  getCanonicalReadModel() {
    this.flushAll(false);
    return {
      displayBlocks: this.displayBlocks,
      aiHistory: this.aiHistory,
    };
  }

  private nextDisplayBlockId(id: string): string {
    const count = this.displayIdCounts.get(id) ?? 0;
    this.displayIdCounts.set(id, count + 1);
    return count === 0 ? id : `${id}:${count + 1}`;
  }

  private upsertToolBlock(draft: ToolDraft, forceFrozen?: boolean) {
    const block = toolBlockFromDraft(draft, forceFrozen, this.subAgentStates.get(draft.id));
    const existingIndex = this.displayBlocks.findIndex((item) => item.id === block.id);
    if (existingIndex === -1) {
      this.displayBlocks.push(block);
    } else {
      this.displayBlocks[existingIndex] = block;
    }
  }

  private flushAssistant(forceFrozen?: boolean) {
    if (!this.assistant) return;
    this.displayBlocks.push({
      type: "assistant",
      id: this.nextDisplayBlockId(this.assistant.id),
      content: this.assistant.content,
      timestamp: this.assistant.timestamp,
      ...(forceFrozen || this.assistant.frozen ? { isFrozen: true as const } : {}),
    });
    this.assistant = null;
  }

  private flushTool(forceFrozen?: boolean) {
    if (!this.tool) return;
    this.upsertToolBlock(this.tool, forceFrozen);
    this.tool = null;
  }

  private flushAll(forceFrozen?: boolean) {
    this.flushAssistant(forceFrozen);
    this.flushTool(forceFrozen);
  }
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

function stringifyToolArgs(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const maybeValue = value as { value?: unknown };
    if (typeof maybeValue.value === "string") return maybeValue.value;
  }
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return String(value);
  }
}

function emitToolMessage(
  emit: HarnessEventEmitter,
  toolCallId: string,
  toolName: string,
  toolArgs: string,
  content: string,
  isError = false,
): void {
  const message = {
    id: `msg_${toolCallId}`,
    role: "tool" as const,
    content,
    modelContent: `[Tool result: ${toolName}]\n${content}`,
    toolCallId,
    toolName,
    toolArgs,
    isError,
  };
  emit(MESSAGE_START, { message }, { relatedToolCallId: toolCallId });
  emit(MESSAGE_END, { message }, { relatedToolCallId: toolCallId });
}
