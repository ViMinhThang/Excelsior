import { SubagentOutcome } from "./types.js";

export function extractJsonObject(response: string): string | null {
  const trimmed = response.trim();

  // Try to find content within markdown blocks first
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const contentToParse = codeBlockMatch?.[1]?.trim() ?? trimmed;

  const start = contentToParse.indexOf("{");
  const end = contentToParse.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return contentToParse.slice(start, end + 1);
}

export function serializeOutcomes(outcomes: SubagentOutcome[]): string {
  return outcomes.map((o) => {
    if (o.ok) {
      return `## Subagent "${o.agentName}" (${o.durationMs}ms) — SUCCESS\n${JSON.stringify(o.value, null, 2)}`;
    }
    return `## Subagent "${o.agentName}" (${o.durationMs}ms) — FAILED\nError: ${o.error}`;
  }).join("\n\n");
}
