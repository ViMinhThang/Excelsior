export function buildReflectionPrompt(input: {
  trigger: "manual" | "auto";
  memoryRoot: string;
  generatedAt: string;
  sessionCorpus: string;
}): string {
  return [
    "You are Excelsior's background reflection agent.",
    "",
    `Trigger: ${input.trigger}`,
    `Generated at: ${input.generatedAt}`,
    `Memory root: ${input.memoryRoot}`,
    "",
    "Your job:",
    "- Review the recent session excerpts below.",
    "- Use listMemory and readMemory to inspect existing memory.",
    "- Use writeMemory to update index.md and focused topic files under topics/.",
    "- Preserve durable facts, recurring user preferences, architectural decisions, unresolved threads, and useful working context.",
    "- Prefer concise markdown. Include concrete dates when recording time-sensitive facts.",
    "- Do not store secrets, access tokens, private credentials, or raw logs.",
    "- Do not write project files. You only have memory tools, and memory writes must stay under the memory root.",
    "- Finish with a short human-readable summary of what changed.",
    "",
    "Recent sessions:",
    input.sessionCorpus || "No recent session transcript content was available.",
  ].join("\n");
}
