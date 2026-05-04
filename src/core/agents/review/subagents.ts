import { Agent } from "../../agent/agent.js";
import { AgentRegistry } from "../../agent/registry.js";
import { subagentResultSchema, type SubagentReviewResult } from "./schemas.js";

const REVIEW_TOOLS = ["list_files", "read_file", "search_files"] as const;

function jsonOutputInstructions(source: string): string {
  return [
    "",
    "IMPORTANT: You MUST return a JSON object with EXACTLY this structure:",
    "{",
    `  "summary": "Short summary",`,
    `  "findings": [ { "source": "${source}", "severity": "high|medium|low", "title": "...", "detail": "...", "file": "...", "line": 123 } ],`,
    `  "notes": [ "any extra string notes" ]`,
    "}",
  ].join("\n");
}

const codeReviewAgent = new Agent<SubagentReviewResult>({
  name: "code-review",
  role: "Code reviewer",
  instructions: [
    "Focus on correctness, regressions, maintainability, and edge cases.",
    jsonOutputInstructions("code-review"),
  ].join("\n"),
  tools: [...REVIEW_TOOLS],
  outputSchema: subagentResultSchema,
  maxSteps: 8,
});

const lintAgent = new Agent<SubagentReviewResult>({
  name: "lint",
  role: "Lint and maintainability reviewer",
  instructions: [
    "Focus on style consistency, type-safety, dead code, tests, and project lint conventions.",
    jsonOutputInstructions("lint"),
  ].join("\n"),
  tools: [...REVIEW_TOOLS],
  outputSchema: subagentResultSchema,
  maxSteps: 6,
});

const securityAgent = new Agent<SubagentReviewResult>({
  name: "security",
  role: "Security reviewer",
  instructions: [
    "Focus on secrets, injection, unsafe execution, authz/authn mistakes, dependency risk, and data exposure.",
    jsonOutputInstructions("security"),
  ].join("\n"),
  tools: [...REVIEW_TOOLS],
  outputSchema: subagentResultSchema,
  maxSteps: 7,
});

// ── Register subagents ──

export function registerReviewSubagents() {
  AgentRegistry.register("code-review", codeReviewAgent);
  AgentRegistry.register("lint", lintAgent);
  AgentRegistry.register("security", securityAgent);
}
