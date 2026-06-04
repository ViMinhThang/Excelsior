import { z } from "zod";
import type { HarnessTool } from "../types.js";
import { text } from "./fs.js";

const spawnSubAgentSchema = z.object({
  role: z.string(),
  prompt: z.string(),
});

export function createSpawnSubAgentTool(): HarnessTool<z.infer<typeof spawnSubAgentSchema>> {
  return {
    name: "spawnSubAgent",
    description: "Run a focused sub-agent for specialized analysis.",
    inputSchema: spawnSubAgentSchema,
    capabilities: ["sub-agent"],
    async execute(input, ctx) {
      return text(await ctx.sendSubAgent(input));
    },
  };
}
