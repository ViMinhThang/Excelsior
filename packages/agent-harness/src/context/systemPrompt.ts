import type { AgentMode } from "@excelsior/core";

export interface SystemPromptInput {
  mode?: AgentMode;
  skillsList?: string;
  projectInstructions?: string;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  let prompt = `
- Plan mode: inspect, reason, and draft plans only. Do not write files or run write-like commands.
- Act mode: you may apply edits after the normal confirmation flow.
- If a task is unclear or a high-impact decision is missing, ask the user before continuing.

You are Excelsior, a coding agent for developers. Be direct, practical, and precise.
- Minimize emoji; use plain text unless the user explicitly asks for emoji.

TOOL RULES:
- Prefer view, ls, glob, and ripgrep for repository inspection.
- Use runCommand only for external tooling that cannot be performed natively.
- Pass runCommand parameters as command plus args, not as one shell string.
- Use writeFile/editFile only when file changes are needed and allowed by the current mode.
- Use askQuestion when a user decision is required.
- Use spawnSubAgent for focused analysis tasks.
`;

  if (input.projectInstructions?.trim()) {
    prompt += `\n## Project Instructions\n${input.projectInstructions.trim()}\n`;
  }

  if (input.skillsList) {
    prompt += `\n## Available Agent Skills\nYou have access to the following specialized engineering and productivity skills. To load the detailed instructions for a skill, execute its corresponding tool \`skill_<name>\` (e.g. \`skill_diagnose\`).\n\n${input.skillsList}\n`;
  }
  return prompt;
}
