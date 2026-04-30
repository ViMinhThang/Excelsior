import type { ChangedFile, FileContext, ReviewMode, ReviewSection, ReviewStage } from "../types.js";
import { Agent } from "../../core/agent.js";
import { runReviewAgentSection, subagentReviewResultSchema, type SubagentReviewResult } from "../subagent.js";
import type { RuntimeContext } from "../../core/runtime.js";

const CODE_REVIEW_ROLE_PROMPT = [
  "You are a code-review subagent.",
  "Use workspace tools to inspect changed files and related context before making claims.",
  "Focus on correctness, regressions, missing tests, maintainability, and edge cases.",
].join("\n");

export interface CodeReviewInput {
  changedFiles: ChangedFile[];
  fileContexts: FileContext[];
  pullRequestBody: string;
  pullRequestTitle: string;
  repository: string;
  workspaceRoot: string;
  runtime: RuntimeContext;
  mode: ReviewMode;
}

export const codeReviewAgent = new Agent<SubagentReviewResult>({
  name: "code-reviewer",
  role: "Code reviewer",
  instructions: CODE_REVIEW_ROLE_PROMPT,
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentReviewResultSchema,
  maxSteps: 8,
  requiredProvider: true,
});

export async function reviewCode(input: CodeReviewInput): Promise<ReviewSection> {
  return runReviewAgentSection({
    agent: codeReviewAgent,
    source: "code-review",
    title: "Code review",
    runtime: input.runtime,
    mode: input.mode,
    prompt: [
      `Repository: ${input.repository}`,
      `Pull request: ${input.pullRequestTitle}`,
      input.pullRequestBody ? `Description:\n${input.pullRequestBody}` : "Description: (none)",
      "Changed files and patches:",
      formatChangedFiles(input.changedFiles),
      "Initial file snapshots:",
      formatFileContexts(input.fileContexts),
      "Inspect the workspace with tools before returning findings.",
    ].join("\n\n"),
  });
}

export const codeReviewStage: ReviewStage = {
  id: "code-review",
  name: "Code Review",
  source: "code-review",
  required: false,
  execute: (ctx) =>
    reviewCode({
      changedFiles: ctx.changedFiles,
      fileContexts: ctx.fileContexts,
      pullRequestBody: ctx.request.pullRequestBody,
      pullRequestTitle: ctx.request.pullRequestTitle,
      repository: ctx.request.repository,
      workspaceRoot: ctx.request.workspaceRoot,
      runtime: ctx.runtime,
      mode: ctx.request.mode,
    }),
};

function formatChangedFiles(changedFiles: ChangedFile[]): string {
  return changedFiles.map((file) => `### ${file.path}\n${file.patch}`).join("\n\n") || "(none)";
}

function formatFileContexts(fileContexts: FileContext[]): string {
  return fileContexts
    .map((ctx) => `### ${ctx.path}${ctx.truncated ? " (truncated)" : ""}\n${ctx.content}`)
    .join("\n\n") || "(none)";
}
