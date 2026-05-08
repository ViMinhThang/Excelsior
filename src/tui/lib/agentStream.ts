import type { ToolLoopAgent } from "ai";
import { StreamCallbacks, StreamPart, UsageInfo, getTextDelta, getToolName, getToolArgs, getToolResult } from "../../types.js";

export async function streamAgentResponse(
  agent: ToolLoopAgent<any, any>,
  messages: Array<{ role: string; content: string | Array<{ type: string; text: string }>; tool_call_id?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }>,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  let fullContent = "";
  let cancelled = false;
  let accInput = 0;
  let accOutput = 0;

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
      } else if (part.type === "finish-step" && part.usage) {
        accInput += part.usage.inputTokens ?? 0;
        accOutput += part.usage.outputTokens ?? 0;
      }
    }

    if (callbacks.onUsage) {
      callbacks.onUsage({
        inputTokens: accInput,
        outputTokens: accOutput,
        totalTokens: accInput + accOutput,
      } as UsageInfo);
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
