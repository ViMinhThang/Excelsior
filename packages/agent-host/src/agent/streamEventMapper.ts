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

export async function emitStreamEvents({
  fullStream,
  signal,
  emit,
}: {
  fullStream: AsyncIterable<unknown>;
  signal: AbortSignal;
  emit: AgentEventEmitter;
}): Promise<boolean> {
  let isCancelled = false;

  for await (const rawPart of fullStream) {
    if (signal.aborted) {
      isCancelled = true;
      break;
    }

    const part = rawPart as StreamPart;

    if (part.type === "text-delta") {
      emit(TEXT_DELTA, { delta: getTextDelta(part) });
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

  emit(RUN_END, { cancelled: isCancelled });
  return isCancelled;
}
