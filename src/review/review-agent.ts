import { z } from "zod";
import { Agent } from "../core/agent.js";
import type { ReviewReport } from "./types.js";

// ── Subagent output schema (shared by all 3 children) ──

export const reviewFindingSchema = z.object({
  source: z.enum(["code-review", "lint", "security"]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(1),
  detail: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
});

export const subagentResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(reviewFindingSchema),
  notes: z.array(z.string()).default([]),
});

export type SubagentReviewResult = z.infer<typeof subagentResultSchema>;

// ── Child Agents ──

export const codeReviewAgent = new Agent<SubagentReviewResult>({
  name: "code-reviewer",
  role: "Code reviewer",
  instructions: "Focus on correctness, regressions, maintainability, and edge cases.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentResultSchema,
  maxSteps: 8,
});

export const lintAgent = new Agent<SubagentReviewResult>({
  name: "lint-reviewer",
  role: "Lint and maintainability reviewer",
  instructions: "Focus on style consistency, type-safety, dead code, tests, and project lint conventions.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentResultSchema,
  maxSteps: 6,
});

export const securityAgent = new Agent<SubagentReviewResult>({
  name: "security-reviewer",
  role: "Security reviewer",
  instructions: "Focus on secrets, injection, unsafe execution, authz/authn mistakes, dependency risk, and data exposure.",
  tools: ["list_files", "read_file", "search_files"],
  outputSchema: subagentResultSchema,
  maxSteps: 7,
});

// ── Synthesizer Agent ──

export const reviewReportSchema = z.object({
  summary: z.string().min(1),
  overview: z.string().min(1),
  sections: z.array(z.object({
    source: z.enum(["code-review", "lint", "security"]),
    title: z.string(),
    summary: z.string(),
    findings: z.array(reviewFindingSchema),
    notes: z.array(z.string()),
  })),
  findings: z.array(reviewFindingSchema),
});

export const reflectionAgent = new Agent<ReviewReport>({
  name: "reflection-synthesizer",
  role: "Review synthesis agent",
  instructions: [
    "You receive the raw outputs from multiple review subagents (code review, lint, security).",
    "Your job is to synthesize them into a single coherent review report.",
    "Deduplicate findings that appear across multiple subagents.",
    "Sort findings by severity (high → medium → low).",
    "Write a concise natural-language summary and overview.",
    "Group findings back into their source sections.",
  ].join("\n"),
  tools: [],
  outputSchema: reviewReportSchema,
  maxSteps: 1,
});

// ── Parent Review Agent ──

export const reviewAgent = new Agent<ReviewReport>({
  name: "pr-reviewer",
  role: "Pull request reviewer",
  instructions: "Coordinate a comprehensive pull request review across code quality, linting, and security dimensions.",
  tools: [],
  outputSchema: reviewReportSchema,
  subagents: [
    { agent: codeReviewAgent, required: false },
    { agent: lintAgent, required: false },
    { agent: securityAgent, required: false },
  ],
  synthesizer: reflectionAgent,
});
