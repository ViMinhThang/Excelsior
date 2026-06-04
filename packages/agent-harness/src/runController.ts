import { randomUUID } from "node:crypto";
import {
  stepCountIs,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import type { AgentMessage } from "@excelsior/core";
import {
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
import { toModelMessages } from "./context/index.js";
import type { ProviderRegistry, ToolRegistry } from "./registries.js";
import type {
  HarnessSettings,
  ToolExecutionContext,
} from "./types.js";

type StepToolResult = {
  toolCallId: string;
  toolName: string;
  content: string;
};

export class RunController {
  async run(input: {
    messages: readonly AgentMessage[];
    systemPrompt: string;
    settings: HarnessSettings;
    providers: ProviderRegistry;
    tools: ToolRegistry;
    toolContext: ToolExecutionContext;
    signal: AbortSignal;
    emit: HarnessEventEmitter;
    getSteeringMessages?: () => string[];
  }): Promise<void> {
    input.emit(AGENT_START, {});
    input.emit(TURN_START, {});

    let cancelled = false;
    let failed = false;
    const runPrefix = randomUUID().slice(0, 8);
    const assistant = new AssistantMessageBuilder(input.emit);
    const toolInputs = new Map<string, { toolName: string; toolArgs: string }>();
    const startedTools = new Set<string>();
    let stepLimit: number | undefined;
    const rawSteps = input.settings.agentToolLoopSteps;
    const normalizedSteps = normalizeAgentToolLoopSteps(rawSteps);
    if (normalizedSteps !== "unlimited") {
      const parsed = Number(normalizedSteps);
      if (!isNaN(parsed)) {
        stepLimit = parsed;
      }
    }

    let activeMessages = [...input.messages];
    let stepCount = 0;
    const completedTools = new Set<string>();
    let failureMessage: string | undefined;

    try {
      while (true) {
        if (input.signal.aborted) {
          cancelled = true;
          break;
        }

        const model = input.providers.get().createModel(input.settings);
        const result = streamText({
          model,
          system: input.systemPrompt,
          messages: toModelMessages(activeMessages),
          tools: input.tools.toToolSet(input.toolContext),
          stopWhen: stepCountIs(1),
          abortSignal: input.signal,
          maxRetries: 3,
        });

        let stepHasToolCalls = false;
        let stepText = "";
        const stepToolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
        const stepToolResults: StepToolResult[] = [];

        for await (const part of result.fullStream as AsyncIterable<TextStreamPart<ToolSet>>) {
          if (input.signal.aborted) {
            cancelled = true;
            break;
          }

          switch (part.type) {
            case "text-start":
              assistant.start(`msg_${runPrefix}_${part.id}`);
              break;
            case "text-delta":
              assistant.update(`msg_${runPrefix}_${part.id}`, part.text);
              stepText += part.text;
              break;
            case "text-end":
              assistant.end(`msg_${runPrefix}_${part.id}`);
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
              stepHasToolCalls = true;
              stepToolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: { name: part.toolName, arguments: toolArgs },
              });
              break;
            }
            case "tool-result": {
              const toolInput = toolInputs.get(part.toolCallId);
              const toolArgs = stringifyToolArgs(part.input ?? toolInput?.toolArgs);
              completeToolExecution({
                emit: input.emit,
                startedTools,
                completedTools,
                stepToolResults,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs,
                resultText: stringifyToolResult(part.output),
                isError: false,
              });
              break;
            }
            case "tool-error": {
              const toolInput = toolInputs.get(part.toolCallId);
              const toolArgs = stringifyToolArgs(part.input ?? toolInput?.toolArgs);
              completeToolExecution({
                emit: input.emit,
                startedTools,
                completedTools,
                stepToolResults,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs,
                resultText: stringifyError(part.error),
                isError: true,
              });
              break;
            }
            case "tool-output-denied": {
              completeToolExecution({
                emit: input.emit,
                startedTools,
                completedTools,
                stepToolResults,
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                toolArgs: "{}",
                resultText: "Tool output denied.",
                isError: true,
              });
              break;
            }
            case "abort":
              cancelled = true;
              break;
            case "error":
              failed = true;
              failureMessage = stringifyError(part.error);
              input.emit(ERROR, { message: failureMessage });
              break;
          }
        }

        if (cancelled || failed) break;

        assistant.end();

        if (stepText.trim() || stepToolCalls.length > 0) {
          activeMessages.push({
            role: "assistant",
            content: stepText,
            tool_calls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
          });
        }

        for (const res of stepToolResults) {
          activeMessages.push({
            role: "tool",
            content: res.content,
            tool_call_id: res.toolCallId,
          });
        }

        if (input.getSteeringMessages) {
          const steeringMsgs = input.getSteeringMessages();
          for (const steeringText of steeringMsgs) {
            activeMessages.push({
              role: "user",
              content: steeringText,
            });
          }
        }

        if (!stepHasToolCalls) {
          break;
        }

        stepCount++;
        if (stepLimit !== undefined && stepCount >= stepLimit) {
          emitAssistantNotice(
            input.emit,
            `Agent stopped after reaching the configured ${stepLimit}-step tool-loop limit.`,
          );
          break;
        }
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === "AbortError" || input.signal.aborted) {
        cancelled = true;
      } else {
        failed = true;
        failureMessage = err.message;
        input.emit(ERROR, { message: failureMessage });
      }
    } finally {
      if (cancelled || failed) {
        finalizeIncompleteToolExecutions({
          emit: input.emit,
          startedTools,
          completedTools,
          toolInputs,
          resultText: cancelled
            ? "Tool execution was cancelled before the tool input completed."
            : `Tool input failed before execution.${failureMessage ? ` ${failureMessage}` : ""}`,
        });
      }
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

function completeToolExecution(input: {
  emit: HarnessEventEmitter;
  startedTools: Set<string>;
  completedTools: Set<string>;
  stepToolResults: StepToolResult[];
  toolCallId: string;
  toolName: string;
  toolArgs: string;
  resultText: string;
  isError: boolean;
}): void {
  if (!input.startedTools.has(input.toolCallId)) {
    input.startedTools.add(input.toolCallId);
    input.emit(
      TOOL_EXECUTION_START,
      {
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolArgs: input.toolArgs,
      },
      { relatedToolCallId: input.toolCallId },
    );
  }
  input.emit(
    TOOL_EXECUTION_END,
    {
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      toolArgs: input.toolArgs,
      result: input.resultText,
      isError: input.isError,
    },
    { relatedToolCallId: input.toolCallId },
  );
  emitToolMessage(input.emit, input.toolCallId, input.toolName, input.toolArgs, input.resultText, input.isError);
  input.completedTools.add(input.toolCallId);
  input.stepToolResults.push({
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    content: input.resultText,
  });
}

function finalizeIncompleteToolExecutions(input: {
  emit: HarnessEventEmitter;
  startedTools: Set<string>;
  completedTools: Set<string>;
  toolInputs: Map<string, { toolName: string; toolArgs: string }>;
  resultText: string;
}): void {
  for (const toolCallId of input.startedTools) {
    if (input.completedTools.has(toolCallId)) continue;
    const toolInput = input.toolInputs.get(toolCallId);
    const toolName = toolInput?.toolName ?? "tool";
    const toolArgs = toolInput?.toolArgs ?? "{}";
    input.emit(
      TOOL_EXECUTION_END,
      {
        toolCallId,
        toolName,
        toolArgs,
        result: input.resultText,
        isError: true,
      },
      { relatedToolCallId: toolCallId },
    );
    emitToolMessage(input.emit, toolCallId, toolName, toolArgs, input.resultText, true);
    input.completedTools.add(toolCallId);
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
