/**
 * @file src/subagents/code-reviewer.ts
 * @description The general Code Review subagent.
 * @why To handle semantic and logic reviews separately from stylistic or security checks.
 * @how Analyzes the PR diff using an LLM to identify logical bugs, bad patterns, or deviations from intent.
 * @input The parsed PR diff, relevant code context, and PR title/description.
 * @output A structured list of code review comments, suggestions, and praises.
 * 
 * @status PLACEHOLDER - Implementation pending.
 */

import { runTurn } from "../core/provider.js";
import { CODE_REVIEW_PROMPT } from "../core/prompts.js";

export async function reviewCode(diff: string, context: string) {
  const systemPrompt = CODE_REVIEW_PROMPT;

  const prompt = `
    Please review the following PR diff:
    ${diff}

    Additional Context:
    ${context}
  `.trim();

  // For now, we just return a placeholder message or use the provider
  // return runTurn(prompt, systemPrompt);
  return { text: "Code review placeholder output." };
}
