import { randomUUID } from "node:crypto";
import {
  MESSAGE_START,
  MESSAGE_UPDATE,
  MESSAGE_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TOOL_EXECUTION_END,
  type HarnessEventEmitter,
} from "../events.js";
import { PROGRESS_BATCH_CHARS, PROGRESS_BATCH_INTERVAL_MS, ProgressBatcher } from "./ProgressBatcher.js";

export class RunEventWriter {
  private assistant: { id: string; content: string } | null = null;

  // Tracks active inputs and execution progress
  private toolInputs = new Map<string, { toolName: string; toolArgs: string }>();
  private toolInputBuffers = new Map<string, { toolName: string; batcher: ProgressBatcher<string> }>();
  private startedTools = new Set<string>();
  private completedTools = new Set<string>();

  constructor(private readonly emit: HarnessEventEmitter) {}

  startMessage(id = `msg_${randomUUID()}`): void {
    if (this.assistant) return;
    this.assistant = { id, content: "" };
    this.emit(MESSAGE_START, {
      message: {
        id,
        role: "assistant",
        content: "",
      },
    });
  }

  updateMessage(id: string, delta: string): void {
    this.startMessage(id);
    if (this.assistant) {
      this.assistant.content += delta;
    }
    this.emit(MESSAGE_UPDATE, {
      messageId: this.assistant?.id ?? id,
      role: "assistant",
      delta,
    });
  }

  endMessage(expectedId?: string): void {
    if (!this.assistant) return;
    const id = this.assistant.id;
    const content = this.assistant.content;
    if (expectedId && expectedId !== id && !content.trim()) return;

    this.emit(MESSAGE_END, {
      message: {
        id,
        role: "assistant",
        content,
      },
    });
    this.assistant = null;
  }

  startTool(callId: string, toolName: string): void {
    this.endMessage();

    this.emit(TOOL_EXECUTION_START, {
      toolCallId: callId,
      toolName,
      toolArgs: "",
    }, { relatedToolCallId: callId });

    this.startedTools.add(callId);
    this.toolInputs.set(callId, { toolName, toolArgs: "" });
    this.toolInputBuffers.set(callId, {
      toolName,
      batcher: new ProgressBatcher<string>({
        intervalMs: PROGRESS_BATCH_INTERVAL_MS,
        chars: PROGRESS_BATCH_CHARS,
        count: (delta) => delta.length,
        onFlush: (deltas) => {
          this.emit(TOOL_EXECUTION_UPDATE, {
            toolCallId: callId,
            toolName,
            delta: deltas.join(""),
          }, { relatedToolCallId: callId });
        },
      }),
    });
  }

  updateToolInput(callId: string, delta: string): void {
    const input = this.toolInputs.get(callId);
    if (input) {
      input.toolArgs += delta;
    }

    const buffer = this.toolInputBuffers.get(callId);
    if (!buffer) return;

    buffer.batcher.append(delta);
  }

  private flushToolInput(callId: string, now = Date.now()): void {
    const buffer = this.toolInputBuffers.get(callId);
    if (!buffer) return;
    buffer.batcher.flush(now);
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
      this.emit(TOOL_EXECUTION_START, {
        toolCallId: callId,
        toolName,
        toolArgs,
      }, { relatedToolCallId: callId });
    }

    return toolArgs;
  }

  completeTool(callId: string, toolArgs: string, resultText: string, isError: boolean): void {
    const input = this.toolInputs.get(callId);
    const toolName = input?.toolName ?? "tool";

    if (!this.startedTools.has(callId)) {
      this.startedTools.add(callId);
      this.emit(TOOL_EXECUTION_START, {
        toolCallId: callId,
        toolName,
        toolArgs,
      }, { relatedToolCallId: callId });
    }

    this.emit(TOOL_EXECUTION_END, {
      toolCallId: callId,
      toolName,
      toolArgs,
      result: resultText,
      isError,
    }, { relatedToolCallId: callId });

    emitToolMessage(this.emit, callId, toolName, toolArgs, resultText, isError);
    this.completedTools.add(callId);
  }

  finalizeIncompleteTools(resultText: string): void {
    for (const toolCallId of this.startedTools) {
      if (this.completedTools.has(toolCallId)) continue;
      const toolInput = this.toolInputs.get(toolCallId);
      const toolName = toolInput?.toolName ?? "tool";
      const toolArgs = toolInput?.toolArgs ?? "{}";

      this.emit(TOOL_EXECUTION_END, {
        toolCallId,
        toolName,
        toolArgs,
        result: resultText,
        isError: true,
      }, { relatedToolCallId: toolCallId });

      emitToolMessage(this.emit, toolCallId, toolName, toolArgs, resultText, true);
      this.completedTools.add(toolCallId);
    }
  }

  emitNotice(content: string): void {
    const id = `msg_${randomUUID()}`;
    this.startMessage(id);
    this.updateMessage(id, content);
    this.endMessage(id);
  }
}

function stringifyToolArgs(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
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
