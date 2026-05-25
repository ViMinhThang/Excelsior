import { ToolLoopAgent } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFileTools } from "./tools/index.js";
import { getSetting } from "../persistence/db.js";
import { buildSystemPrompt } from "./prompt.js";
import type { ToolContext } from "../tooling/context.js";
import type { StreamCapableAgent, AgentEventEmitter } from "../runtime/agentStream.js";
import type { AgentMessage } from "@excelsior/core";
import {
  StreamPart,
  getTextDelta,
  getToolName,
  getToolArgs,
  getToolResult,
} from "../runtime/streamTypes.js";
import { withRetry, isTransientError } from "../runtime/retry.js";
import {
  RUN_START,
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_START,
  TOOL_CALL_END,
  ERROR,
} from "../runtime/eventNames.js";

interface Streamable {
  stream(input: { messages: unknown[] }): Promise<{ fullStream: AsyncIterable<unknown> }>;
}

export class ExcelsiorAgent implements StreamCapableAgent {
  constructor(private readonly agent: Streamable) {}

  async stream(input: {
    messages: AgentMessage[];
    signal: AbortSignal;
    emit: AgentEventEmitter;
  }): Promise<void> {
    const { messages, signal, emit } = input;
    let isCancelled = false;

    emit(RUN_START, {});

    try {
      const stream = (await withRetry(() => this.agent.stream({ messages: messages as unknown as unknown[] }), {
        signal,
        maxRetries: 3,
        baseDelayMs: 1000,
        onRetry: (error, attempt) => {
          emit(TEXT_DELTA, {
            delta: `\nRetry ${attempt}/3  API error: ${error.message} - retrying...\n`,
          });
        },
      })) as { fullStream: AsyncIterable<unknown> };

      for await (const rawPart of stream.fullStream) {
        if (signal.aborted) {
          isCancelled = true;
          break;
        }

        const part = rawPart as StreamPart;

        if (part.type === "text-delta") {
          const delta = getTextDelta(part);
          emit(TEXT_DELTA, { delta });
        } else if (part.type === "tool-call") {
          const toolName = getToolName(part);
          const toolArgs = getToolArgs(part);
          const toolCallId = part.toolCallId;
          emit(
            TOOL_CALL_START,
            { toolName, toolArgs, toolCallId },
            { relatedToolCallId: toolCallId },
          );
        } else if (part.type === "tool-result" || part.type === "tool-error") {
          const toolCallId = part.toolCallId;
          const result = getToolResult(part);
          const status = part.type === "tool-error" ? "error" : "success";
          emit(
            TOOL_CALL_END,
            {
              toolCallId,
              result,
              status,
              toolName: getToolName(part),
              toolArgs: getToolArgs(part),
            },
            { relatedToolCallId: toolCallId },
          );
        }
      }

      emit(RUN_END, { cancelled: isCancelled });
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

  const agent = new ToolLoopAgent({
    model,
    instructions: finalInstructions,
    tools: {
      ...createFileTools(ctx),
      ...extraTools,
    },
  });

  return new ExcelsiorAgent(agent as unknown as Streamable);
}
