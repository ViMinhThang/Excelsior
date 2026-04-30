import { z } from "zod";

import type { Agent } from "../core/agent.js";
import type { RuntimeContext } from "../core/runtime.js";
import type {
  ReviewFinding,
  ReviewMode,
  ReviewSection,
  ReviewSource,
  ReviewSeverity,
} from "./types.js";

const severitySchema = z.enum(["high", "medium", "low"]);
const sourceSchema = z.enum(["code-review", "lint", "security"]);

export const subagentReviewResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(z.object({
    source: sourceSchema,
    severity: severitySchema,
    title: z.string().min(1),
    detail: z.string().min(1),
    file: z.string().optional(),
    line: z.number().int().positive().optional(),
  })),
  notes: z.array(z.string()).default([]),
});

export type SubagentReviewResult = z.output<typeof subagentReviewResultSchema>;

export interface ReviewAgentRunInput {
  agent: Agent<SubagentReviewResult>;
  source: ReviewSource;
  title: string;
  prompt: string;
  runtime: RuntimeContext;
  mode: ReviewMode;
}

export async function runReviewAgentSection(input: ReviewAgentRunInput): Promise<ReviewSection> {
  const result = await input.agent.run({
    prompt: buildReviewPrompt(input.source, input.prompt),
    runtime: input.runtime,
    mode: input.mode,
  });

  if (!result.ok) {
    return {
      source: input.source,
      title: input.title,
      summary: result.reason === "missing-provider"
        ? `${input.title} skipped because no LLM provider is configured.`
        : `${input.title} could not parse agent output.`,
      findings: [],
      notes: [result.message],
    };
  }

  return {
    source: input.source,
    title: input.title,
    summary: result.value.summary,
    findings: normalizeFindings(result.value.findings, input.source),
    notes: result.value.notes,
  };
}

function buildReviewPrompt(source: ReviewSource, taskPrompt: string): string {
  return [
    taskPrompt,
    "You must inspect relevant workspace files with tools before making findings.",
    "Use list_files, read_file, and search_files when they help validate a claim.",
    "Return only strict JSON with this shape:",
    '{"summary":"string","findings":[{"source":"' + source + '","severity":"high|medium|low","title":"string","detail":"string","file":"optional/path","line":1}],"notes":["string"]}',
    "Do not include speculative findings.",
  ].join("\n\n");
}

function normalizeFindings(findings: SubagentReviewResult["findings"], source: ReviewSource): ReviewFinding[] {
  return findings.map((finding) => ({
    source,
    severity: finding.severity as ReviewSeverity,
    title: finding.title,
    detail: finding.detail,
    ...(finding.file !== undefined ? { file: finding.file } : {}),
    ...(finding.line !== undefined ? { line: finding.line } : {}),
  }));
}
