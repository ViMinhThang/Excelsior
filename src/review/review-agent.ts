import { z } from "zod";
import { Agent } from "../core/agent/agent.js";
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

// ── Factory for review subagents ──

const REVIEW_TOOLS = ["list_files", "read_file", "search_files"] as const;

function jsonOutputInstructions(source: string): string {
  return [
    "",
    'IMPORTANT: You MUST return a JSON object with EXACTLY this structure:',
    "{",
    `  "summary": "Short summary",`,
    `  "findings": [ { "source": "${source}", "severity": "high|medium|low", "title": "...", "detail": "...", "file": "...", "line": 123 } ],`,
    `  "notes": [ "any extra string notes" ]`,
    "}",
  ].join("\n");
}

function createReviewSubagent(
  name: string,
  role: string,
  instructions: string,
  source: string,
  maxSteps: number,
): Agent<SubagentReviewResult> {
  return new Agent<SubagentReviewResult>({
    name,
    role,
    instructions: [instructions, jsonOutputInstructions(source)].join("\n"),
    tools: [...REVIEW_TOOLS],
    outputSchema: subagentResultSchema,
    maxSteps,
  });
}

// ── Child Agents ──

export const codeReviewAgent = createReviewSubagent(
  "code-reviewer",
  "Code reviewer",
  "Focus on correctness, regressions, maintainability, and edge cases.",
  "code-review",
  8,
);

export const lintAgent = createReviewSubagent(
  "lint-reviewer",
  "Lint and maintainability reviewer",
  "Focus on style consistency, type-safety, dead code, tests, and project lint conventions.",
  "lint",
  6,
);

export const securityAgent = createReviewSubagent(
  "security-reviewer",
  "Security reviewer",
  "Focus on secrets, injection, unsafe execution, authz/authn mistakes, dependency risk, and data exposure.",
  "security",
  7,
);

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
    "",
    "IMPORTANT: You MUST return a JSON object with EXACTLY this structure:",
    "{",
    '  "summary": "Short 1-sentence summary",',
    '  "overview": "Detailed paragraphs explaining the review results",',
    '  "sections": [ { "source": "code-review|lint|security", "title": "...", "summary": "...", "findings": [...], "notes": [...] } ],',
    '  "findings": [ { "source": "code-review|lint|security", "severity": "high|medium|low", "title": "...", "detail": "...", "file": "...", "line": 123 } ]',
    "}",
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
