// Invariant: streamAgentResponse always emits run-start before
//   any other event, and run-end as the last event.
//   Retries are applied for transient errors (429, 502, 503, 504).

import type { ToolLoopAgent } from "ai";
import {
  StreamPart,
  getTextDelta,
  getToolName,
  getToolArgs,
  getToolResult,
} from "../../types.js";
import { AgentRun } from "./agentRun.js";
import { withRetry, isTransientError } from "../../utils/retry.js";
import { RUN_START, RUN_END, TEXT_DELTA, TOOL_CALL_START, TOOL_CALL_END, ERROR } from "./event-names.js";

export async function streamAgentResponse(
  agent: ToolLoopAgent<any, any>,
  messages: Array<{
    role: string;
    content: string | Array<{ type: string; text: string }>;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  }>,
  run: AgentRun,
  signal?: AbortSignal,
): Promise<void> {
  let cancelled = false;

  run.emit(RUN_START, {});

  try {
    const stream = await withRetry(() => agent.stream({ messages } as any), {
      signal,
      maxRetries: 3,
      baseDelayMs: 1000,
      onRetry: (error, attempt) => {
        run.emit(TEXT_DELTA, {
          delta: `\n[Retry ${attempt}/3] API error: ${error.message} — retrying...\n`,
        });
      },
    });

    for await (const rawPart of stream.fullStream) {
      if (signal?.aborted) {
        cancelled = true;
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

    run.emit(RUN_END, { cancelled });
  } catch (error: any) {
    if (error?.name === "AbortError" || error?.message?.includes("abort")) {
      run.emit(RUN_END, { cancelled: true });
      return;
    }

    if (isTransientError(error)) {
      run.emit(TEXT_DELTA, {
        delta: `\n[Error] API request failed after retries: ${error.message}\n`,
      });
    }
    run.emit(ERROR, { message: error?.message ?? String(error) });
    run.emit(RUN_END, { cancelled: true });
  }
}
