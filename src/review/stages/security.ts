import type { ChangedFile, ReviewMode, ReviewSection, ReviewStage } from "../types.js";
import { Agent } from "../../core/agent.js";
import type { RuntimeContext } from "../../core/runtime.js";
import { runReviewAgentSection, subagentReviewResultSchema, type SubagentReviewResult } from "../subagent.js";

const SECURITY_ROLE_PROMPT = [
  "You are a security-review subagent.",
  "Use workspace tools to inspect changed code and related call paths before making claims.",
  "Focus on secrets, injection, unsafe execution, authz/authn mistakes, dependency risk, and data exposure.",
].join("\n");

export interface SecurityInput {
  changedFiles: ChangedFile[];
  workspaceRoot: string;
  runtime: RuntimeContext;
  mode: ReviewMode;
}

export const securityAgent = new Agent<SubagentReviewResult>({
  name: "security-reviewer",
  role: "Security reviewer",
  instructions: SECURITY_ROLE_PROMPT,
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentReviewResultSchema,
  maxSteps: 7,
  requiredProvider: true,
});

export async function auditSecurity(input: SecurityInput): Promise<ReviewSection> {
  return runReviewAgentSection({
    agent: securityAgent,
    source: "security",
    title: "Security scan",
    runtime: input.runtime,
    mode: input.mode,
    prompt: [
      "Review the changed files for security issues.",
      "Use tools to inspect related handlers, config, auth boundaries, dependency files, and data flow before reporting findings.",
      "Changed files and patches:",
      formatChangedFiles(input.changedFiles),
    ].join("\n\n"),
  });
}

export const securityStage: ReviewStage = {
  id: "security",
  name: "Security Audit",
  source: "security",
  required: false,
  execute: (ctx) =>
    auditSecurity({
      changedFiles: ctx.changedFiles,
      workspaceRoot: ctx.request.workspaceRoot,
      runtime: ctx.runtime,
      mode: ctx.request.mode,
    }),
};

function formatChangedFiles(changedFiles: ChangedFile[]): string {
  return changedFiles.map((file) => `### ${file.path}\n${file.patch}`).join("\n\n") || "(none)";
}
