import { z } from "zod";
import type { AgentRunInput, SubagentOutcome } from "./types.js";
import { AgentRegistry } from "./registry.js";

export const plannedSubagentSchema = z.object({
  name: z.string(),
  prompt: z.string(),
});

export const plannerOutputSchema = z.object({
  plan: z.string(),
  subagents: z.array(plannedSubagentSchema),
});

export type PlannedSubagent = z.infer<typeof plannedSubagentSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export async function executePlannedSubagents(
  input: AgentRunInput,
  planned: PlannedSubagent[],
  signal: AbortSignal,
): Promise<SubagentOutcome[]> {
  return Promise.all(
    planned.map(async (item) => {
      const startedAt = performance.now();
      const agent = AgentRegistry.get(item.name);
      if (!agent) {
        return {
          ok: false,
          agentName: item.name,
          durationMs: performance.now() - startedAt,
          error: `Agent '${item.name}' not found in registry`,
        } as SubagentOutcome;
      }

      try {
        const result = await agent.run({
          ...input,
          prompt: item.prompt,
          signal,
        });
        if (!result.ok) throw new Error(result.message);
        return {
          ok: true,
          agentName: item.name,
          durationMs: performance.now() - startedAt,
          value: result.value,
        } as SubagentOutcome;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          agentName: item.name,
          durationMs: performance.now() - startedAt,
          error: message,
        } as SubagentOutcome;
      }
    }),
  );
}
