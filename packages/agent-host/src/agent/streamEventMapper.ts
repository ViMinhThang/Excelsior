import type { AgentEventEmitter } from "../runtime/events.js";
import {
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
} from "../runtime/eventNames.js";
import {
  StreamPart,
  getTextDelta,
  getToolName,
  getToolArgs,
  getToolResult,
} from "../runtime/streamTypes.js";

export function createToolLoopStepLimitWarning(stepLimit: number): string {
  return `\n[Agent stopped after reaching the configured ${stepLimit}-step tool-loop limit. Increase Agent Run Budget or send another message to continue.]\n`;
}

export async function emitStreamEvents({
  fullStream,
  signal,
  emit,
  toolLoopStepLimit,
}: {
  fullStream: AsyncIterable<unknown>;
  signal: AbortSignal;
  emit: AgentEventEmitter;
  toolLoopStepLimit?: number;
}): Promise<boolean> {
  let isCancelled = false;
  let endedAfterToolResult = false;

  for await (const rawPart of fullStream) {
    if (signal.aborted) {
      isCancelled = true;
      break;
    }

    const part = rawPart as StreamPart;

    if (part.type === "text-delta") {
      endedAfterToolResult = false;
      emit(TEXT_DELTA, { delta: getTextDelta(part) });
    } else if (part.type === "tool-call") {
      endedAfterToolResult = false;
      const toolName = getToolName(part);
      const toolArgs = getToolArgs(part);
      const toolCallId = part.toolCallId;
      emit(
        TOOL_CALL_START,
        { toolName, toolArgs, toolCallId },
        { relatedToolCallId: toolCallId },
      );
    } else if (part.type === "tool-result" || part.type === "tool-error") {
      endedAfterToolResult = part.type === "tool-result";
      const toolCallId = part.toolCallId;
      emit(
        TOOL_CALL_END,
        {
          toolCallId,
          result: getToolResult(part),
          status: part.type === "tool-error" ? "error" : "success",
          toolName: getToolName(part),
          toolArgs: getToolArgs(part),
        },
        { relatedToolCallId: toolCallId },
      );
    }
  }

  if (!isCancelled && toolLoopStepLimit !== undefined && endedAfterToolResult) {
    emit(TEXT_DELTA, {
      delta: createToolLoopStepLimitWarning(toolLoopStepLimit),
    });
  }

  emit(RUN_END, { cancelled: isCancelled });
  return isCancelled;
}
