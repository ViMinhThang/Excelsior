import { randomUUID } from "node:crypto";
import {
  isLoopFinished,
  stepCountIs,
  streamText,
  type StopCondition,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import type { AgentMessage, AgentMode } from "@excelsior/core";
import {
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
} from "@excelsior/core";
import {
  AGENT_END,
  AGENT_START,
  ERROR,
  MESSAGE_END,
  MESSAGE_START,
  MESSAGE_UPDATE,
  TOOL_EXECUTION_END,
  TOOL_EXECUTION_START,
  TOOL_EXECUTION_UPDATE,
  TURN_END,
  TURN_START,
  type HarnessEventEmitter,
} from "./events.js";
import { toModelMessages } from "./modelMessages.js";
import { buildSystemPrompt } from "./prompt.js";
import type { ProviderRegistry, ToolRegistry } from "./registries.js";
import type {
  HarnessSettings,
  ToolExecutionContext,
} from "./types.js";

export class RunController {
  async run(input: {
    messages: readonly AgentMessage[];
    mode: AgentMode;
    settings: HarnessSettings;
    providers: ProviderRegistry;
    tools: ToolRegistry;
    toolContext: ToolExecutionContext;
    signal: AbortSignal;
    emit: HarnessEventEmitter;
  }): Promise<void> {
    input.emit(AGENT_START, {});
    input.emit(TURN_START, {});

    let cancelled = false;
    let failed = false;
    const assistant = new AssistantMessageBuilder(input.emit);
    const toolInputs = new Map<string, { toolName: string; toolArgs: string }>();
    const startedTools = new Set<string>();
    const toolLoopBudget = resolveToolLoopBudget(input.settings.agentToolLoopSteps);
    let endedAfterToolResult = false;

    try {
      const model = input.providers.get().createModel(input.settings);
      const result = streamText({
        model,
        system: buildSystemPrompt(input.mode),
        messages: toModelMessages(input.messages),
        tools: input.tools.toToolSet(input.toolContext),
        stopWhen: toolLoopBudget.stopWhen,
        abortSignal: input.signal,
        maxRetries: 3,
      });

      for await (const part of result.fullStream as AsyncIterable<TextStreamPart<ToolSet>>) {
        if (input.signal.aborted) {
          cancelled = true;
          break;
        }

        switch (part.type) {
          case "text-start":
            assistant.start(`msg_${part.id}`);
            endedAfterToolResult = false;
            break;
          case "text-delta":
            assistant.update(`msg_${part.id}`, part.text);
            endedAfterToolResult = false;
            break;
          case "text-end":
            assistant.end(`msg_${part.id}`);
            break;
          case "tool-input-start":
            toolInputs.set(part.id, { toolName: part.toolName, toolArgs: "" });
            assistant.end();
            startedTools.add(part.id);
            input.emit(
              TOOL_EXECUTION_START,
              {
                toolCallId: part.id,
                toolName: part.toolName,
                toolArgs: "",
              },
              { relatedToolCallId: part.id },
            );
            break;
          case "tool-input-delta": {
            const current = toolInputs.get(part.id);
            if (current) {
              toolInputs.set(part.id, {
                ...current,
                toolArgs: `${current.toolArgs}${part.delta}`,
              });
              input.emit(
                TOOL_EXECUTION_UPDATE,
                {
                  toolCallId: part.id,
                  toolName: current.toolName,
                  delta: part.delta,
                },
                { relatedToolCallId: part.id },
              );
            }
            break;
          }
          case "tool-call": {
            assistant.end();
            const toolInput = toolInputs.get(part.toolCallId);
            const toolArgs = stringifyToolArgs(part.input ?? toolInput?.toolArgs);
            toolInputs.set(part.toolCallId, {
              toolName: part.toolName,
              toolArgs,
            });
            if (!startedTools.has(part.toolCallId)) {
              startedTools.add(part.toolCallId);
              input.emit(
                TOOL_EXECUTION_START,
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  toolArgs,
                },
                { relatedToolCallId: part.toolCallId },
              );
            }
            endedAfterToolResult = false;
            break;
          }
          case "tool-result": {
            const toolInput = toolInputs.get(part.toolCallId);
            const toolArgs = stringifyToolArgs(part.input ?? toolInput?.toolArgs);
            const resultText = stringifyToolResult(part.output);
            if (!startedTools.has(part.toolCallId)) {
              input.emit(
                TOOL_EXECUTION_START,
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  toolArgs,
                },
                { relatedToolCallId: part.toolCallId },
              );
            }
            input.emit(
              TOOL_EXECUTION_END,
              {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs,
                result: resultText,
                isError: false,
              },
              { relatedToolCallId: part.toolCallId },
            );
            emitToolMessage(input.emit, part.toolCallId, part.toolName, toolArgs, resultText);
            endedAfterToolResult = true;
            break;
          }
          case "tool-error": {
            const toolInput = toolInputs.get(part.toolCallId);
            const toolArgs = stringifyToolArgs(part.input ?? toolInput?.toolArgs);
            const resultText = stringifyError(part.error);
            if (!startedTools.has(part.toolCallId)) {
              input.emit(
                TOOL_EXECUTION_START,
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  toolArgs,
                },
                { relatedToolCallId: part.toolCallId },
              );
            }
            input.emit(
              TOOL_EXECUTION_END,
              {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs,
                result: resultText,
                isError: true,
              },
              { relatedToolCallId: part.toolCallId },
            );
            emitToolMessage(input.emit, part.toolCallId, part.toolName, toolArgs, resultText, true);
            endedAfterToolResult = true;
            break;
          }
          case "tool-output-denied": {
            const toolArgs = "{}";
            const resultText = "Tool output denied.";
            if (!startedTools.has(part.toolCallId)) {
              input.emit(
                TOOL_EXECUTION_START,
                {
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  toolArgs,
                },
                { relatedToolCallId: part.toolCallId },
              );
            }
            input.emit(
              TOOL_EXECUTION_END,
              {
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs,
                result: resultText,
                isError: true,
              },
              { relatedToolCallId: part.toolCallId },
            );
            emitToolMessage(input.emit, part.toolCallId, part.toolName, toolArgs, resultText, true);
            endedAfterToolResult = true;
            break;
          }
          case "abort":
            cancelled = true;
            break;
          case "error":
            failed = true;
            input.emit(ERROR, { message: stringifyError(part.error) });
            break;
        }
      }

      assistant.end();
      if (!cancelled && !failed && toolLoopBudget.stepLimit !== undefined && endedAfterToolResult) {
        emitAssistantNotice(
          input.emit,
          `Agent stopped after reaching the configured ${toolLoopBudget.stepLimit}-step tool-loop limit.`,
        );
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === "AbortError" || input.signal.aborted) {
        cancelled = true;
      } else {
        failed = true;
        input.emit(ERROR, { message: err.message });
      }
    } finally {
      const endState = { cancelled: cancelled || failed };
      input.emit(TURN_END, endState);
      input.emit(AGENT_END, endState);
    }
  }
}

class AssistantMessageBuilder {
  private id: string | null = null;
  private content = "";

  constructor(private readonly emit: HarnessEventEmitter) {}

  start(id = `msg_${randomUUID()}`): void {
    if (this.id) return;
    this.id = id;
    this.content = "";
    this.emit(MESSAGE_START, {
      message: {
        id: this.id,
        role: "assistant",
        content: "",
      },
    });
  }

  update(id: string, delta: string): void {
    this.start(id);
    this.content += delta;
    this.emit(MESSAGE_UPDATE, {
      messageId: this.id ?? id,
      role: "assistant",
      delta,
      content: this.content,
    });
  }

  end(expectedId?: string): void {
    if (!this.id) return;
    const id = this.id;
    const content = this.content;
    this.id = null;
    this.content = "";
    if (expectedId && expectedId !== id && !content.trim()) return;
    this.emit(MESSAGE_END, {
      message: {
        id,
        role: "assistant",
        content,
      },
    });
  }
}

function emitAssistantNotice(emit: HarnessEventEmitter, content: string): void {
  const id = `msg_${randomUUID()}`;
  emit(MESSAGE_START, {
    message: {
      id,
      role: "assistant",
      content: "",
    },
  });
  emit(MESSAGE_UPDATE, {
    messageId: id,
    role: "assistant",
    delta: content,
    content,
  });
  emit(MESSAGE_END, {
    message: {
      id,
      role: "assistant",
      content,
    },
  });
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

function resolveToolLoopBudget(value: string | null | undefined): {
  stopWhen: StopCondition<ToolSet>;
  stepLimit?: number;
} {
  const normalized = normalizeAgentToolLoopSteps(value);
  if (normalized === DEFAULT_AGENT_TOOL_LOOP_STEPS) {
    return { stopWhen: isLoopFinished() };
  }
  const stepLimit = Number(normalized);
  return { stopWhen: stepCountIs(stepLimit), stepLimit };
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

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return stringifyToolResult(error);
}
