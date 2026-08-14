import type {
  AgentMessage,
  SessionState,
  ToolCallBlock,
  TranscriptBlock,
} from "@excelsior/protocol";
import type { RunStep, RunToolCall, RunTurn } from "./runStore.js";

function toolCallToToolBlock(call: RunToolCall): ToolCallBlock {
  return {
    id: call.id,
    toolName: call.toolName,
    args: typeof call.args === "string" ? call.args : JSON.stringify(call.args),
    result: call.result ?? "",
    isError: call.isError ?? false,
    status:
      call.status === "done"
        ? "completed"
        : call.status === "denied"
          ? "failed"
          : call.status === "error"
            ? "failed"
            : "interrupted",
    startedAt: call.startedAt ?? Date.now(),
    endedAt: call.endedAt ?? Date.now(),
  };
}

export function turnToTranscriptBlocks(turn: RunTurn, includeUser = true): TranscriptBlock[] {
  const now = Date.now();
  const blocks: TranscriptBlock[] = [];

  if (includeUser) {
    blocks.push({
      id: `user_${turn.id}`,
      turnId: turn.id,
      kind: "user",
      role: "user",
      content: turn.userContent,
      status: "completed",
      createdAt: turn.startedAt,
      finalizedAt: turn.startedAt,
    });
  }

  for (const block of turn.blocks) {
    if (block.kind === "assistant") {
      blocks.push({
        id: block.id,
        turnId: turn.id,
        kind: "assistant",
        role: "assistant",
        content: block.content,
        status:
          turn.status === "cancelled"
            ? "interrupted"
            : turn.status === "failed"
              ? "failed"
              : "completed",
        createdAt: turn.startedAt,
        finalizedAt: now,
      });
    } else if (block.kind === "tool-call" && block.tool) {
      const toolRef = block.tool;
      const tool = turn.steps
        .flatMap((step) => step.toolCalls)
        .find((call) => call.id === toolRef.id);
      const toolBlock = tool
        ? toolCallToToolBlock(tool)
        : {
            id: toolRef.id ?? "",
            toolName: toolRef.toolName ?? "unknown",
            args: typeof toolRef.args === "string" ? toolRef.args : JSON.stringify(toolRef.args ?? {}),
            result: toolRef.result ?? "",
            isError: toolRef.isError ?? false,
            status: "interrupted",
            startedAt: turn.startedAt,
            endedAt: now,
          } satisfies ToolCallBlock;
      blocks.push({
        id: block.id,
        turnId: turn.id,
        kind: "tool-call",
        content: toolBlock.result,
        tool: toolBlock,
        status:
          turn.status === "cancelled"
            ? "interrupted"
            : turn.status === "failed"
              ? "failed"
              : "completed",
        createdAt: turn.startedAt,
        finalizedAt: now,
      });
    }
  }

  return blocks;
}

export function buildAiHistory(
  committed: SessionState,
  active: RunTurn | null,
): AgentMessage[] {
  const messages: AgentMessage[] = [];

  for (const block of committed.blocks) {
    if (block.kind === "user") {
      messages.push({ role: "user", content: block.content });
    } else if (block.kind === "assistant") {
      messages.push({ role: "assistant", content: block.content });
    } else if (block.kind === "tool-call" && block.tool) {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: block.tool.id,
            type: "function",
            function: {
              name: block.tool.toolName,
              arguments:
                typeof block.tool.args === "string"
                  ? block.tool.args
                  : JSON.stringify(block.tool.args ?? {}),
            },
          },
        ],
      });
      messages.push({
        role: "tool",
        content: block.tool.result,
        tool_call_id: block.tool.id,
      });
    }
  }

  if (active) {
    const hasUser = committed.blocks.some((b) => b.id === `user_${active.id}`);
    if (!hasUser) {
      messages.push({ role: "user", content: active.userContent });
    }
    for (const step of active.steps) {
      if (step.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: step.modelOutput,
          tool_calls: step.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.toolName,
              arguments:
                typeof call.args === "string" ? call.args : JSON.stringify(call.args),
            },
          })),
        });
        for (const call of step.toolCalls) {
          messages.push({
            role: "tool",
            content: call.result ?? "",
            tool_call_id: call.id,
          });
        }
      } else if (step.modelOutput) {
        messages.push({ role: "assistant", content: step.modelOutput });
      }
    }
  }

  return messages;
}

export function latestStep(turn: RunTurn): RunStep {
  const last = turn.steps[turn.steps.length - 1];
  if (last && last.toolCalls.length === 0) return last;
  const step: RunStep = { id: `step_${turn.steps.length + 1}`, modelOutput: "", toolCalls: [] };
  turn.steps.push(step);
  return step;
}
