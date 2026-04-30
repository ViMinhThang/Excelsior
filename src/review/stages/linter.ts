import type { ChangedFile, ReviewMode, ReviewSection, ReviewStage } from "../types.js";
import { Agent } from "../../core/agent.js";
import type { RuntimeContext } from "../../core/runtime.js";
import { runReviewAgentSection, subagentReviewResultSchema, type SubagentReviewResult } from "../subagent.js";

const LINT_ROLE_PROMPT = [
  "You are a lint and maintainability subagent.",
  "Use workspace tools to inspect changed files and nearby conventions.",
  "Focus on style consistency, type-safety, dead code, tests, and project lint conventions.",
].join("\n");

export interface LintInput {
  changedFiles: ChangedFile[];
  workspaceRoot: string;
  runtime: RuntimeContext;
  mode: ReviewMode;
}

export const lintAgent = new Agent<SubagentReviewResult>({
  name: "lint-reviewer",
  role: "Lint and maintainability reviewer",
  instructions: LINT_ROLE_PROMPT,
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentReviewResultSchema,
  maxSteps: 6,
  requiredProvider: true,
});

export async function lintCode(input: LintInput): Promise<ReviewSection> {
  return runReviewAgentSection({
    agent: lintAgent,
    source: "lint",
    title: "Lint and style",
    runtime: input.runtime,
    mode: input.mode,
    prompt: [
      "Review the changed files for style, type-safety, dead code, missing tests, and local convention issues.",
      "Use tools to inspect package config, lint config, tests, and related files before reporting findings.",
      "Changed files and patches:",
      formatChangedFiles(input.changedFiles),
    ].join("\n\n"),
  });
}

export const lintStage: ReviewStage = {
  id: "lint",
  name: "Linting",
  source: "lint",
  required: false,
  execute: (ctx) =>
    lintCode({
      changedFiles: ctx.changedFiles,
      workspaceRoot: ctx.request.workspaceRoot,
      runtime: ctx.runtime,
      mode: ctx.request.mode,
    }),
};

function formatChangedFiles(changedFiles: ChangedFile[]): string {
  return changedFiles.map((file) => `### ${file.path}\n${file.patch}`).join("\n\n") || "(none)";
}
