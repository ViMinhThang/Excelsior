import { SubagentOutcome } from "./types.js";

export function extractJsonObject(response: string): string | null {
  const trimmed = response.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

export function serializeOutcomes(outcomes: SubagentOutcome[]): string {
  return outcomes.map((o) => {
    if (o.ok) {
      return `## Subagent "${o.agentName}" (${o.durationMs}ms) — SUCCESS\n${JSON.stringify(o.value, null, 2)}`;
    }
    return `## Subagent "${o.agentName}" (${o.durationMs}ms) — FAILED\nError: ${o.error}`;
  }).join("\n\n");
}
