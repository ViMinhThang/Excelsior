import type { ToolLoopAgent } from "ai";
import { StreamCallbacks, StreamPart, getTextDelta, getToolName, getToolArgs, getToolResult } from "../../types.js";

export async function streamAgentResponse(
  agent: ToolLoopAgent<any, any>,
  messages: Array<{ role: string; content: string }>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  let fullContent = "";
  let cancelled = false;

  try {
    const stream = await agent.stream({ messages: messages } as any);

    for await (const rawPart of stream.fullStream) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const part = rawPart as StreamPart;

      if (part.type === "text-delta") {
        const delta = getTextDelta(part);
        fullContent += delta;
        callbacks.onTextDelta(fullContent);
      } else if (part.type === "tool-call") {
        callbacks.onToolCall(
          getToolName(part),
          getToolArgs(part),
          part.toolCallId,
        );
      } else if (part.type === "tool-result" || part.type === "tool-error") {
        callbacks.onToolResult(part.toolCallId, getToolResult(part));
      }
    }

    callbacks.onFinish(fullContent, cancelled);
    return fullContent;
  } catch (error: any) {
    if (error?.name === "AbortError" || error?.message?.includes("abort")) {
      callbacks.onFinish(fullContent, true);
      return fullContent;
    }
    callbacks.onFinish(fullContent, true);
    throw error;
  }
}
