/**
 * RunController orchestrates the step-by-step agent execution loop.
 *
 * Lifecycle and Execution Flow:
 * 1. Emits `AGENT_START` and `TURN_START` to initialize the run context and hierarchy boundaries.
 * 2. Runs an execution loop (`while (true)`) representing steps of the agent's tool-call loop:
 *    - Validates abort signals (`input.signal.aborted`) before triggering new network calls.
 *    - Initiates an LLM request via Vercel AI SDK's `streamText()`. By setting `stopWhen: stepCountIs(1)`,
 *      the SDK is configured to pause after exactly one generation/execution step, returning control back to us.
 * 3. Streams parts from the response (`fullStream`) and delegates to `RunAssistantState` (the event writer):
 *    - `text-*` and `reasoning-*`: Streams the assistant's talking and thinking output live.
 *    - `tool-input-*`: Streams raw JSON tool arguments token-by-token.
 *    - `tool-call`, `tool-result`, `tool-error`, `tool-output-denied`: Runs the local tool execution logic,
 *      marking the tool status, capturing returns/errors, and saving results.
 * 4. At the end of each step:
 *    - Commits the accumulated assistant response (conversational text and/or tool call structures) and
 *      the respective tool execution results back to the local conversation history (`activeMessages`).
 *    - Ingests and appends any user-provided steering messages (mid-run corrections) into history.
 *    - Ends the loop if the assistant did not generate any new tool calls (`!stepHasToolCalls`) or if it
 *      reaches loop limits (`agentToolLoopSteps`).
 * 5. Handles cleanup in the `finally` block: finalizes incomplete tool logs, flushes buffers,
 *    and emits `TURN_END` and `AGENT_END` lifecycle boundaries.
 */
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
  TURN_END,
  TURN_START,
  REASONING_END,
  type HarnessEventEmitter,
} from "./events.js";
import { RunEventWriter } from "./context/RunEventWriter.js";
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
    const state = new RunEventWriter(input.emit);

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
    let stepReasoning = "";
    let reasoningId = "";

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
        stepReasoning = "";
        reasoningId = "";
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
            case "reasoning-start":
              reasoningId = part.id;
              state.startReasoning(part.id);
              break;
            case "reasoning-delta":
              stepReasoning += part.text;
              state.updateReasoning(part.id, part.text);
              break;
            case "reasoning-end":
              state.endReasoning();
              if (stepReasoning) {
                input.emit(REASONING_END, { messageId: part.id, content: stepReasoning });
              }
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
        if (stepReasoning && reasoningId) {
          input.emit(REASONING_END, { messageId: reasoningId, content: stepReasoning });
        }
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
