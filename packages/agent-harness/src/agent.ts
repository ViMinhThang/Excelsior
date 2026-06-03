import { isLoopFinished, stepCountIs, ToolLoopAgent, type ModelMessage } from "ai";
import type { AgentMessage } from "@excelsior/core";
import {
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
} from "@excelsior/core";
import type { HarnessEventEmitter, HarnessEvent } from "./events.js";
import { ERROR, RUN_END, RUN_START, TEXT_DELTA } from "./events.js";
import type {
  HarnessSettings,
  ProviderRegistry,
  ToolRegistry,
  ToolExecutionContext,
} from "./internalTypes.js";
import { buildSystemPrompt } from "./prompt.js";
import { toModelMessages } from "./modelMessages.js";
import { withRetry, isTransientError } from "./retry.js";
import { emitStreamEvents } from "./stream.js";

interface Streamable {
  stream(input: {
    messages: ModelMessage[];
    abortSignal?: AbortSignal;
  }): PromiseLike<{ fullStream: AsyncIterable<unknown> }>;
}

export async function runHarnessAgent(input: {
  messages: readonly AgentMessage[];
  mode: "plan" | "act";
  settings: HarnessSettings;
  providers: ProviderRegistry;
  tools: ToolRegistry;
  toolContext: ToolExecutionContext;
  signal: AbortSignal;
  emit: HarnessEventEmitter;
}): Promise<void> {
  input.emit(RUN_START, {});
  try {
    const toolLoopBudget = resolveToolLoopBudget(input.settings.agentToolLoopSteps);
    const model = input.providers.get().createModel(input.settings);
    const agent: Streamable = new ToolLoopAgent({
      model,
      instructions: buildSystemPrompt(input.mode),
      stopWhen: toolLoopBudget.stopWhen,
      tools: input.tools.toToolSet(input.toolContext),
    });
    const stream = await withRetry({
      signal: input.signal,
      maxRetries: 3,
      onRetry: (error, attempt) => {
        input.emit(TEXT_DELTA, {
          delta: `\nRetry ${attempt}/3 API error: ${error.message} - retrying...\n`,
        });
      },
      run: async () =>
        agent.stream({
          messages: toModelMessages(input.messages),
          abortSignal: input.signal,
        }),
    });

    await emitStreamEvents({
      fullStream: stream.fullStream,
      signal: input.signal,
      emit: input.emit,
      toolLoopStepLimit: toolLoopBudget.stepLimit,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === "AbortError" || input.signal.aborted) {
      input.emit(RUN_END, { cancelled: true });
      return;
    }
    if (isTransientError(err)) {
      input.emit(TEXT_DELTA, {
        delta: `\n[Error] API request failed after retries: ${err.message}\n`,
      });
    }
    input.emit(ERROR, { message: err.message });
    input.emit(RUN_END, { cancelled: true });
  }
}

function resolveToolLoopBudget(value: string | null | undefined): {
  stopWhen: ReturnType<typeof isLoopFinished>;
  stepLimit?: number;
} {
  const normalized = normalizeAgentToolLoopSteps(value);
  if (normalized === DEFAULT_AGENT_TOOL_LOOP_STEPS) {
    return { stopWhen: isLoopFinished() };
  }
  const stepLimit = Number(normalized);
  return { stopWhen: stepCountIs(stepLimit), stepLimit };
}

export type { HarnessEvent };
