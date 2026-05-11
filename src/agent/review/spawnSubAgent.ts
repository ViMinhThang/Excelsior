import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createAgent } from "../../agent/agent.js";
import { ToolCallInfo, getTextDelta, getToolName, getToolArgs, getToolResult } from "../../types.js";
import { SubAgentOutputPart } from "../../lib/eventTypes.js";
import { subAgentBus } from "../../lib/subAgentBus.js";
import { StreamPart } from "../../types.js";

function emitBusOutput(
  toolCallId: string,
  fullOutput: string,
  outputParts: SubAgentOutputPart[],
  toolCalls: ToolCallInfo[],
  latestLine?: string,
) {
  const lines = fullOutput.split("\n");
  subAgentBus.emit("output", {
    toolCallId,
    latestLine: latestLine ?? (lines[lines.length - 1] || lines[lines.length - 2] || ""),
    fullOutput,
    outputParts: [...outputParts],
    toolCalls: [...toolCalls],
  });
}

export const spawnSubAgentTool = tool({
  description:
    "Spawn a specialist sub-agent to analyze code. The sub-agent runs as an Excelsior instance with a focused role.",
  inputSchema: z.object({
    role: z
      .string()
      .describe(
        "Role name, e.g. 'Bug Hunter', 'Security Auditor', 'Code Style Reviewer'",
      ),
    instruction: z
      .string()
      .describe("Detailed analysis task with code context for this specialist"),
  }),
  execute: async ({ role, instruction }: { role: string; instruction: string }) => {
    const toolCallId = `sub_${randomUUID()}`;
    subAgentBus.emit("spawned", { toolCallId, role });

    const subInstructions =
      `\n\n---\nROLE: ${role}\n---\n` +
      `\nYou are a sub-agent of a larger code review.` +
      `\nDo NOT spawn sub-agents, agents, or tools that delegate to other agents.` +
      `\nComplete your assigned task directly.` +
      `\n---\n\n${instruction}`;

    const agent = createAgent(subInstructions);

    let fullOutput = "";
    const outputParts: SubAgentOutputPart[] = [];
    const toolCalls: ToolCallInfo[] = [];

    function addTextDelta(delta: string) {
      const partsLen = outputParts.length;
      if (partsLen > 0 && outputParts[partsLen - 1].type === "text") {
        const last = outputParts[partsLen - 1] as SubAgentOutputPart & { type: "text" };
        outputParts[partsLen - 1] = { type: "text", text: last.text + delta };
      } else {
        outputParts.push({ type: "text", text: delta });
      }
    }

    try {
      const stream = await agent.stream({ messages: [{ role: "user", content: instruction }] } as any);

      for await (const rawPart of stream.fullStream) {
        const part = rawPart as StreamPart;

        if (part.type === "text-delta") {
          const delta = getTextDelta(part);
          fullOutput += delta;
          addTextDelta(delta);
          emitBusOutput(toolCallId, fullOutput, outputParts, toolCalls);
        } else if (part.type === "tool-call") {
          const toolName = getToolName(part);
          const toolArgs = getToolArgs(part);
          const callId = part.toolCallId;
          outputParts.push({ type: "tool-call", toolName, toolArgs, toolCallId: callId, status: "pending" });
          toolCalls.push({ toolName, toolArgs, toolCallId: callId, status: "pending" });
          emitBusOutput(toolCallId, fullOutput, outputParts, toolCalls, `[tool] ${toolName}(${toolArgs})`);
        } else if (part.type === "tool-result" || part.type === "tool-error") {
          const result = getToolResult(part);
          const callId = part.toolCallId;
          const isError = part.type === "tool-error";
          const status = isError ? ("error" as const) : ("completed" as const);
          for (let i = 0; i < outputParts.length; i++) {
            const p = outputParts[i];
            if (p.type === "tool-call" && p.toolCallId === callId) {
              outputParts[i] = { ...p, status };
            }
          }
          toolCalls.forEach((tc, i) => {
            if (tc.toolCallId === callId) {
              toolCalls[i] = { ...tc, status };
            }
          });
          emitBusOutput(toolCallId, fullOutput, outputParts, toolCalls, `[tool] ${status}`);
        }
      }

      subAgentBus.emit("done", { toolCallId, fullOutput });
      return fullOutput;
    } catch (error: any) {
      const errorMsg = `Sub-agent error: ${error.message}`;
      fullOutput += `\n\nError: ${errorMsg}`;
      outputParts.push({ type: "text", text: `\n\nError: ${errorMsg}` });
      emitBusOutput(toolCallId, fullOutput, outputParts, toolCalls, errorMsg);
      subAgentBus.emit("done", { toolCallId, fullOutput });
      return fullOutput;
    }
  },
});
