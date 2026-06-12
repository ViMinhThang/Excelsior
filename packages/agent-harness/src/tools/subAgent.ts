import { z } from "zod";
import type { HarnessTool } from "../types.js";
import { text } from "./fs.js";
import { runSpawnedSubAgent } from "../subagentProcess.js";

const spawnSubAgentSchema = z.object({
  role: z.string(),
  prompt: z.string(),
});

export function createSpawnSubAgentTool(): HarnessTool<z.infer<typeof spawnSubAgentSchema>> {
  return {
    name: "spawnSubAgent",
    description: "Run a focused sub-agent for specialized analysis.",
    inputSchema: spawnSubAgentSchema,
    async execute(input, ctx, options) {
      const parentToolCallId = options?.toolCallId;
      if (!parentToolCallId) return text(await ctx.sendSubAgent(input));
      return runSpawnedSubAgent({
        role: input.role,
        prompt: input.prompt,
        parentToolCallId,
        ctx,
      });
    },
  };
}
