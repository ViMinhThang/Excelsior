import { z } from "zod";
import type { HarnessTool } from "../types.js";
import { text } from "./fs.js";
import { runSpawnedSubAgent } from "../subagent/process.js";

const spawnSubAgentSchema = z.object({
  role: z.string(),
  prompt: z.string(),
});

export function createSpawnSubAgentTool(): HarnessTool<z.infer<typeof spawnSubAgentSchema>> {
  return {
    name: "spawnSubAgent",
    description: "Run a focused sub-agent for specialized analysis.",
    inputSchema: spawnSubAgentSchema,
    async execute(input, env, _actions, options) {
      const parentToolCallId = options?.toolCallId;
      if (!parentToolCallId) {
        return text("spawnSubAgent requires an active tool call.", true);
      }
      return runSpawnedSubAgent({
        role: input.role,
        prompt: input.prompt,
        parentToolCallId,
        env,
      });
    },
  };
}
