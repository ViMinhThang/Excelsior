import type { TextStreamPart, ToolSet } from "ai";
import type { AgentMessage } from "@excelsior/core";
import { ERROR, REASONING_END, type HarnessEventEmitter } from "../events.js";
import { RunEventWriter } from "../context/RunEventWriter.js";

type StepToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type StepToolResult = {
  toolCallId: string;
  content: string;
};

export type RunStepStatus = "completed" | "cancelled" | "failed";

export interface RunStepResult {
  status: RunStepStatus;
  hasToolCalls: boolean;
  messages: AgentMessage[];
}

export class RunStepRecorder {
  private stepText = "";
  private stepReasoning = "";
  private reasoningId = "";
  private hasToolCalls = false;
  private failureMessage: string | undefined;
  private status: RunStepStatus = "completed";
  private readonly toolCalls: StepToolCall[] = [];
  private readonly toolResults: StepToolResult[] = [];

  constructor(
    private readonly input: {
      emit: HarnessEventEmitter;
      writer: RunEventWriter;
      messageIdForTextPart: (partId: string) => string;
    },
  ) {}

  accept(part: TextStreamPart<ToolSet>): void {
    switch (part.type) {
      case "text-start":
        this.input.writer.startMessage(this.input.messageIdForTextPart(part.id));
        break;
      case "text-delta":
        this.input.writer.updateMessage(this.input.messageIdForTextPart(part.id), part.text);
        this.stepText += part.text;
        break;
      case "text-end":
        this.input.writer.endMessage(this.input.messageIdForTextPart(part.id));
        break;
      case "reasoning-start":
        this.reasoningId = part.id;
        this.input.writer.startReasoning(part.id);
        break;
      case "reasoning-delta":
        this.stepReasoning += part.text;
        this.input.writer.updateReasoning(part.id, part.text);
        break;
      case "reasoning-end":
        this.finishReasoning(part.id);
        break;
      case "tool-input-start":
        this.input.writer.startTool(part.id, part.toolName);
        break;
      case "tool-input-delta":
        this.input.writer.updateToolInput(part.id, part.delta);
        break;
      case "tool-call":
        this.recordToolCall(part.toolCallId, part.toolName, part.input);
        break;
      case "tool-result":
        this.recordToolResult(part.toolCallId, part.input, part.output, false);
        break;
      case "tool-error":
        this.recordToolResult(part.toolCallId, part.input, part.error, true);
        break;
      case "tool-output-denied":
        this.recordDeniedToolOutput(part.toolCallId);
        break;
      case "abort":
        this.status = "cancelled";
        break;
      case "error":
        this.fail(stringifyError(part.error));
        break;
    }
  }

  cancel(): void {
    this.status = "cancelled";
  }

  fail(message: string): void {
    this.status = "failed";
    this.failureMessage = message;
    this.input.emit(ERROR, { message });
  }

  finish(): RunStepResult {
    if (this.status === "completed") {
      this.input.writer.endMessage();
    } else {
      this.input.writer.flushAllToolUpdates();
      this.input.writer.finalizeIncompleteTools(
        this.status === "cancelled"
          ? "Tool execution was cancelled before the tool input completed."
          : `Tool input failed before execution.${this.failureMessage ? ` ${this.failureMessage}` : ""}`,
      );
      this.flushReasoning();
    }

    return {
      status: this.status,
      hasToolCalls: this.hasToolCalls,
      messages: this.toMessages(),
    };
  }

  private recordToolCall(toolCallId: string, toolName: string, input: unknown): void {
    const toolArgs = this.input.writer.endToolInput(toolCallId, input);
    this.hasToolCalls = true;
    this.toolCalls.push({
      id: toolCallId,
      type: "function",
      function: { name: toolName, arguments: toolArgs },
    });
  }

  private recordToolResult(
    toolCallId: string,
    input: unknown,
    output: unknown,
    isError: boolean,
  ): void {
    const toolArgs = this.input.writer.endToolInput(toolCallId, input);
    const resultText = isError ? stringifyError(output) : stringifyToolResult(output);
    this.input.writer.completeTool(toolCallId, toolArgs, resultText, isError);
    this.toolResults.push({
      toolCallId,
      content: resultText,
    });
  }

  private recordDeniedToolOutput(toolCallId: string): void {
    const toolArgs = this.input.writer.endToolInput(toolCallId);
    const resultText = "Tool output denied.";
    this.input.writer.completeTool(toolCallId, toolArgs, resultText, true);
    this.toolResults.push({
      toolCallId,
      content: resultText,
    });
  }

  private finishReasoning(messageId: string): void {
    this.input.writer.endReasoning();
    if (this.stepReasoning) {
      this.input.emit(REASONING_END, { messageId, content: this.stepReasoning });
    }
    this.stepReasoning = "";
    this.reasoningId = "";
  }

  private flushReasoning(): void {
    if (this.stepReasoning && this.reasoningId) {
      this.input.emit(REASONING_END, {
        messageId: this.reasoningId,
        content: this.stepReasoning,
      });
    }
    this.stepReasoning = "";
    this.reasoningId = "";
  }

  private toMessages(): AgentMessage[] {
    const messages: AgentMessage[] = [];
    if (this.stepText.trim() || this.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: this.stepText,
        tool_calls: this.toolCalls.length > 0 ? this.toolCalls : undefined,
      });
    }

    for (const result of this.toolResults) {
      messages.push({
        role: "tool",
        content: result.content,
        tool_call_id: result.toolCallId,
      });
    }

    return messages;
  }
}

export function stringifyToolResult(value: unknown): string {
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

export function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return stringifyToolResult(error);
}
