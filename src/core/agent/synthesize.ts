import type { Agent } from "./agent.js";
import type { AgentRunInput, AgentRunResult, SubagentOutcome } from "./types.js";
import { serializeOutcomes } from "./utils.js";

export async function synthesizeOutcomes<TOutput>(
  synthesizer: Agent<TOutput> | undefined,
  input: AgentRunInput,
  outcomes: SubagentOutcome[],
): Promise<AgentRunResult<TOutput>> {
  if (!synthesizer) {
    return {
      ok: true,
      value: outcomes as unknown as TOutput,
      raw: JSON.stringify(outcomes),
    };
  }

  const synthPrompt = [
    input.prompt,
    "Subagent results:",
    serializeOutcomes(outcomes),
  ].join("\n\n");

  const result = await synthesizer.run({
    ...input,
    prompt: synthPrompt,
  });

  if (!result.ok) return result as AgentRunResult<TOutput>;
  return { ok: true, value: result.value as TOutput, raw: result.raw };
}
