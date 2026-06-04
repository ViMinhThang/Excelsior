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
import { toModelMessages, AssistantStateMachine } from "./context/index.js";
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

type ToolInputUpdateBuffer = {
  toolName: string;
  delta: string;
  lastEmittedAt: number;
};

const TOOL_INPUT_UPDATE_INTERVAL_MS = 250;
const TOOL_INPUT_UPDATE_CHARS = 2048;

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
    const state = new AssistantStateMachine(input.emit);

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
              state.startMessage(`msg_${runPrefix}_${part.id}`);
              break;
            case "text-delta":
              state.updateMessage(`msg_${runPrefix}_${part.id}`, part.text);
              stepText += part.text;
              break;
            case "text-end":
              state.endMessage(`msg_${runPrefix}_${part.id}`);
              break;
            case "tool-input-start":
              state.startTool(part.id, part.toolName);
              break;
            case "tool-input-delta": {
              state.updateToolInput(part.id, part.delta);
              break;
            }
            case "tool-call": {
              const toolArgs = state.endToolInput(part.toolCallId, part.input);
              stepHasToolCalls = true;
              stepToolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: { name: part.toolName, arguments: toolArgs },
              });
              break;
            }
            case "tool-result": {
              const toolArgs = state.endToolInput(part.toolCallId, part.input);
              const resultText = stringifyToolResult(part.output);
              state.completeTool(part.toolCallId, toolArgs, resultText, false);
              stepToolResults.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                content: resultText,
              });
              break;
            }
            case "tool-error": {
              const toolArgs = state.endToolInput(part.toolCallId, part.input);
              const resultText = stringifyError(part.error);
              state.completeTool(part.toolCallId, toolArgs, resultText, true);
              stepToolResults.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                content: resultText,
              });
              break;
            }
            case "tool-output-denied": {
              const toolArgs = state.endToolInput(part.toolCallId);
              const resultText = "Tool output denied.";
              state.completeTool(part.toolCallId, toolArgs, resultText, true);
              stepToolResults.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                content: resultText,
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

        state.endMessage();

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
          state.emitNotice(
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
        state.flushAllToolUpdates();
        state.finalizeIncompleteTools(
          cancelled
            ? "Tool execution was cancelled before the tool input completed."
            : `Tool input failed before execution.${failureMessage ? ` ${failureMessage}` : ""}`,
        );
      }
      const endState = { cancelled: cancelled || failed };
      input.emit(TURN_END, endState);
      input.emit(AGENT_END, endState);
    }
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
