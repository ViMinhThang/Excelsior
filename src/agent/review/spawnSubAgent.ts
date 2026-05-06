import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createAgent } from "../../agent/agent.js";

export const subAgentRegistry = {
  onSpawned: null as
    | ((args: { toolCallId: string; role: string }) => void)
    | null,
  onOutput: null as
    | ((args: {
        toolCallId: string;
        latestLine: string;
        fullOutput: string;
      }) => void)
    | null,
  onDone: null as
    | ((args: { toolCallId: string; fullOutput: string }) => void)
    | null,
};

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
    subAgentRegistry.onSpawned?.({ toolCallId, role });

    const subInstructions =
      `\n\n---\nROLE: ${role}\n---\n` +
      `\nYou are a sub-agent of a larger code review.` +
      `\nDo NOT spawn sub-agents, agents, or tools that delegate to other agents.` +
      `\nComplete your assigned task directly.` +
      `\n---\n\n${instruction}`;

    const agent = createAgent(subInstructions);

    let fullOutput = "";
    const stream = await agent.stream({
      messages: [{ role: "user", content: instruction }],
    });

    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") {
        const delta = (part as any).text ?? (part as any).textDelta ?? "";
        fullOutput += delta;
        const lines = fullOutput.split("\n");
        subAgentRegistry.onOutput?.({
          toolCallId,
          latestLine: lines[lines.length - 1] || lines[lines.length - 2] || "",
          fullOutput,
        });
      }
    }

    subAgentRegistry.onDone?.({ toolCallId, fullOutput });
    return fullOutput;
  },
});
