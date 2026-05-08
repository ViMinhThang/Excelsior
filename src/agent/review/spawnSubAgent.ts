import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createAgent } from "../../agent/agent.js";
import { SubAgentOutputPart, ToolCallInfo } from "../../types.js";
import { streamAgentResponse } from "../../lib/agentStream.js";

type SubListener = {
  onSpawned: (args: { toolCallId: string; role: string }) => void;
  onOutput: (args: { toolCallId: string; latestLine: string; fullOutput: string; outputParts: SubAgentOutputPart[]; toolCalls: ToolCallInfo[] }) => void;
  onDone: (args: { toolCallId: string; fullOutput: string }) => void;
};

export function createSubAgentBus() {
  const listeners = new Set<SubListener>();

  return {
    subscribe(listener: SubListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emitSpawned(args: { toolCallId: string; role: string }) {
      listeners.forEach(l => l.onSpawned(args));
    },
    emitOutput(args: { toolCallId: string; latestLine: string; fullOutput: string; outputParts: SubAgentOutputPart[]; toolCalls: ToolCallInfo[] }) {
      listeners.forEach(l => l.onOutput(args));
    },
    emitDone(args: { toolCallId: string; fullOutput: string }) {
      listeners.forEach(l => l.onDone(args));
    },
  };
}

const defaultBus = createSubAgentBus();

export const subAgentBus = defaultBus;

function emitBusOutput(
  bus: ReturnType<typeof createSubAgentBus>,
  toolCallId: string,
  fullOutput: string,
  outputParts: SubAgentOutputPart[],
  toolCalls: ToolCallInfo[],
  latestLine?: string,
) {
  const lines = fullOutput.split("\n");
  bus.emitOutput({
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
    defaultBus.emitSpawned({ toolCallId, role });

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
      await streamAgentResponse(
        agent,
        [{ role: "user", content: instruction }],
        {
          onTextDelta: (text) => {
            const delta = text.slice(fullOutput.length);
            fullOutput = text;
            addTextDelta(delta);
            emitBusOutput(defaultBus, toolCallId, fullOutput, outputParts, toolCalls);
          },
          onToolCall: (toolName, toolArgs, callId) => {
            outputParts.push({ type: "tool-call", toolName, toolArgs, toolCallId: callId, status: "pending" });
            toolCalls.push({ toolName, toolArgs, toolCallId: callId, status: "pending" });
            emitBusOutput(defaultBus, toolCallId, fullOutput, outputParts, toolCalls, `[tool] ${toolName}(${toolArgs})`);
          },
          onToolResult: (callId, result) => {
            const isError = result.startsWith("[Error]");
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
            emitBusOutput(defaultBus, toolCallId, fullOutput, outputParts, toolCalls, `[tool] ${status}`);
          },
          onFinish: () => {},
        },
      );

      defaultBus.emitDone({ toolCallId, fullOutput });
      return fullOutput;
    } catch (error: any) {
      const errorMsg = `Sub-agent error: ${error.message}`;
      fullOutput += `\n\nError: ${errorMsg}`;
      outputParts.push({ type: "text", text: `\n\nError: ${errorMsg}` });
      emitBusOutput(defaultBus, toolCallId, fullOutput, outputParts, toolCalls, errorMsg);
      defaultBus.emitDone({ toolCallId, fullOutput });
      return fullOutput;
    }
  },
});
