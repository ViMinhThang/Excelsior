import type { ToolLoopAgent } from "ai";
import { StreamPart, getTextDelta, getToolName, getToolArgs, getToolResult } from "../../types.js";
import { AgentSession } from "./agentSession.js";

export async function streamAgentResponse(
  agent: ToolLoopAgent<any, any>,
  messages: Array<{ role: string; content: string | Array<{ type: string; text: string }>; tool_call_id?: string; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> }>,
  session: AgentSession,
  signal?: AbortSignal,
): Promise<void> {
  let cancelled = false;

  session.emit("session-start", {});

  try {
    const stream = await agent.stream({ messages } as any);

    for await (const rawPart of stream.fullStream) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const part = rawPart as StreamPart;

      if (part.type === "text-delta") {
        const delta = getTextDelta(part);
        session.emit("text-delta", { delta });
      } else if (part.type === "tool-call") {
        const toolName = getToolName(part);
        const toolArgs = getToolArgs(part);
        const toolCallId = part.toolCallId;
        session.emit("tool-call-start", { toolName, toolArgs, toolCallId }, { relatedToolCallId: toolCallId });
      } else if (part.type === "tool-result" || part.type === "tool-error") {
        const toolCallId = part.toolCallId;
        const result = getToolResult(part);
        const status = part.type === "tool-error" ? "error" : "success";
        session.emit("tool-call-end", { toolCallId, result, status, toolName: getToolName(part), toolArgs: getToolArgs(part) }, { relatedToolCallId: toolCallId });
      }
    }

    session.emit("session-end", { cancelled });
  } catch (error: any) {
    if (error?.name === "AbortError" || error?.message?.includes("abort")) {
      session.emit("session-end", { cancelled: true });
      return;
    }
    session.emit("error", { message: error?.message ?? String(error) });
    session.emit("session-end", { cancelled: true });
  }
}
