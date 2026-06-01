import {
  isLoopFinished,
  stepCountIs,
  ToolLoopAgent,
  type ModelMessage,
} from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "@excelsior/agent-storage";
import { buildSystemPrompt } from "./prompt.js";
import type { ToolContext } from "./tools/core/context.js";
import type { StreamCapableAgent, AgentEventEmitter } from "../runtime/events.js";
import {
  AGENT_TOOL_LOOP_STEPS_SETTING,
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
  type AgentMessage,
} from "@excelsior/core";
import { withRetry, isTransientError } from "../runtime/retry.js";
import {
  RUN_START,
  RUN_END,
  TEXT_DELTA,
  ERROR,
} from "../runtime/eventNames.js";
import { toModelMessages } from "./modelMessageAdapter.js";
import { createSkillToolAdapter } from "./skillToolAdapter.js";
import { emitStreamEvents } from "./streamEventMapper.js";

interface Streamable {
  stream(input: {
    messages: ModelMessage[];
    abortSignal?: AbortSignal;
  }): PromiseLike<{ fullStream: AsyncIterable<unknown> }>;
}

export class ExcelsiorAgent implements StreamCapableAgent {
  constructor(
    private readonly agent: Streamable,
    private readonly options: { toolLoopStepLimit?: number } = {},
  ) {}

  async stream(input: {
    messages: AgentMessage[];
    signal: AbortSignal;
    emit: AgentEventEmitter;
  }): Promise<void> {
    const { messages, signal, emit } = input;

    emit(RUN_START, {});

    try {
      const stream = await withRetry(
        async () =>
          this.agent.stream({
            messages: toModelMessages(messages),
            abortSignal: signal,
          }),
        {
          signal,
          maxRetries: 3,
          baseDelayMs: 1000,
          onRetry: (error, attempt) => {
            emit(TEXT_DELTA, {
              delta: `\nRetry ${attempt}/3  API error: ${error.message} - retrying...\n`,
            });
          },
        },
      );

      await emitStreamEvents({
        fullStream: stream.fullStream,
        signal,
        emit,
        toolLoopStepLimit: this.options.toolLoopStepLimit,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === "AbortError" || err.message.includes("abort")) {
        emit(RUN_END, { cancelled: true });
        return;
      }

      if (isTransientError(err)) {
        emit(TEXT_DELTA, {
          delta: `\n[Error] API request failed after retries: ${err.message}\n`,
        });
      }
      emit(ERROR, { message: err.message ?? String(error) });
      emit(RUN_END, { cancelled: true });
    }
  }
}

export function createAgent(
  instructions?: string,
  extraTools?: Record<string, unknown>,
  ctx?: ToolContext,
): StreamCapableAgent {
  const systemPrompt = buildSystemPrompt(ctx?.mode);
  const apiKey = getSetting("DEEPSEEK_API_KEY");
  const deepseek = createDeepSeek({
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
  });
  const model = deepseek("deepseek-v4-flash");

  const finalInstructions = instructions
    ? `${systemPrompt}\n\n---\n${instructions}\n---`
    : systemPrompt;

  const skillAdapter = createSkillToolAdapter(ctx?.workspaceRoot);
  const normalizedToolLoopSteps = normalizeAgentToolLoopSteps(
    getSetting(AGENT_TOOL_LOOP_STEPS_SETTING),
  );
  const toolLoopStepLimit =
    normalizedToolLoopSteps === DEFAULT_AGENT_TOOL_LOOP_STEPS
      ? undefined
      : Number(normalizedToolLoopSteps);

  const agent = new ToolLoopAgent({
    model,
    instructions: `${finalInstructions}${skillAdapter.instructions}`,
    stopWhen:
      toolLoopStepLimit === undefined
        ? isLoopFinished()
        : stepCountIs(toolLoopStepLimit),
    tools: {
      ...createFileTools(ctx),
      ...skillAdapter.tools,
      ...extraTools,
    },
  });

  return new ExcelsiorAgent(agent, {
    toolLoopStepLimit,
  });
}
