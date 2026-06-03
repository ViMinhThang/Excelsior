import type { HarnessEventEmitter } from "./events.js";
import {
  RUN_END,
  TEXT_DELTA,
  TOOL_CALL_END,
  TOOL_CALL_START,
} from "./events.js";

type StreamPart =
  | { type: "text-delta"; text?: string; delta?: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName?: string;
      input?: unknown;
      args?: unknown;
    }
  | {
      type: "tool-result" | "tool-error";
      toolCallId: string;
      toolName?: string;
      input?: unknown;
      args?: unknown;
      output?: unknown;
      result?: unknown;
      error?: unknown;
    }
  | { type: string };

type TextDeltaPart = Extract<StreamPart, { type: "text-delta" }>;
type ToolCallPart = Extract<StreamPart, { type: "tool-call" }>;
type ToolResultPart = Extract<StreamPart, { type: "tool-result" | "tool-error" }>;

export async function emitStreamEvents(input: {
  fullStream: AsyncIterable<unknown>;
  signal: AbortSignal;
  emit: HarnessEventEmitter;
  toolLoopStepLimit?: number;
}): Promise<void> {
  let cancelled = false;
  let endedAfterToolResult = false;

  for await (const rawPart of input.fullStream) {
    if (input.signal.aborted) {
      cancelled = true;
      break;
    }

    const part = rawPart as StreamPart;
    if (part.type === "text-delta") {
      const textPart = part as TextDeltaPart;
      endedAfterToolResult = false;
      input.emit(TEXT_DELTA, { delta: textPart.delta ?? textPart.text ?? "" });
    } else if (part.type === "tool-call") {
      const toolPart = part as ToolCallPart;
      endedAfterToolResult = false;
      const toolCallId = toolPart.toolCallId;
      input.emit(
        TOOL_CALL_START,
        {
          toolCallId,
          toolName: toolPart.toolName ?? "unknown",
          toolArgs: stringifyToolArgs(toolPart.input ?? toolPart.args),
        },
        { relatedToolCallId: toolCallId },
      );
    } else if (part.type === "tool-result" || part.type === "tool-error") {
      const resultPart = part as ToolResultPart;
      endedAfterToolResult = resultPart.type === "tool-result";
      const toolCallId = resultPart.toolCallId;
      input.emit(
        TOOL_CALL_END,
        {
          toolCallId,
          toolName: resultPart.toolName ?? "unknown",
          toolArgs: stringifyToolArgs(resultPart.input ?? resultPart.args),
          result: stringifyToolResult(resultPart.output ?? resultPart.result ?? resultPart.error),
          status: resultPart.type === "tool-error" ? "error" : "success",
        },
        { relatedToolCallId: toolCallId },
      );
    }
  }

  if (!cancelled && input.toolLoopStepLimit !== undefined && endedAfterToolResult) {
    input.emit(TEXT_DELTA, {
      delta: `\n[Agent stopped after reaching the configured ${input.toolLoopStepLimit}-step tool-loop limit.]\n`,
    });
  }

  input.emit(RUN_END, { cancelled });
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
