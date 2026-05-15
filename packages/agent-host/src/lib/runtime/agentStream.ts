import type { ToolLoopAgent } from "ai";
import type { AgentMessage } from "@excelsior/core";
import {
  StreamPart,
  getTextDelta,
  getToolName,
  getToolArgs,
  getToolResult,
} from "./streamTypes.js";
import { AgentRun } from "./agentRun.js";
import { withRetry, isTransientError } from "./retry.js";
import {
  RUN_START,
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_START,
  TOOL_CALL_END,
  ERROR,
} from "./eventNames.js";

export async function streamAgentResponse(
  agent: ToolLoopAgent<any, any>,
  messages: AgentMessage[],
  run: AgentRun,
  signal: AbortSignal,
): Promise<void> {
  let isCancelled = false;

  run.emit(RUN_START, {});

  try {
    const stream = await withRetry(() => agent.stream({ messages } as any), {
      signal,
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (error, attempt) => {
        run.emit(TEXT_DELTA, {
          delta: `\nRetry ${attempt}/3  API error: ${error.message} - retrying...\n`,
        });
      },
    });

    for await (const rawPart of stream.fullStream) {
      if (signal.aborted) {
        isCancelled = true;
        break;
      }

      const part = rawPart as StreamPart;

      if (part.type === "text-delta") {
        const delta = getTextDelta(part);
        run.emit(TEXT_DELTA, { delta });
      } else if (part.type === "tool-call") {
        const toolName = getToolName(part);
        const toolArgs = getToolArgs(part);
        const toolCallId = part.toolCallId;
        run.emit(
          TOOL_CALL_START,
          { toolName, toolArgs, toolCallId },
          { relatedToolCallId: toolCallId },
        );
      } else if (part.type === "tool-result" || part.type === "tool-error") {
        const toolCallId = part.toolCallId;
        const result = getToolResult(part);
        const status = part.type === "tool-error" ? "error" : "success";
        run.emit(
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

    run.emit(RUN_END, { cancelled: isCancelled });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === "AbortError" || err.message.includes("abort")) {
      run.emit(RUN_END, { cancelled: true });
      return;
    }

    if (isTransientError(err)) {
      run.emit(TEXT_DELTA, {
        delta: `\n[Error] API request failed after retries: ${err.message}\n`,
      });
    }
    run.emit(ERROR, { message: err.message ?? String(error) });
    run.emit(RUN_END, { cancelled: true });
  }
}
