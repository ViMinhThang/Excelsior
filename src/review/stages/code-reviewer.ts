/**
 * Orchestrates the code review process by combining lightweight heuristic-based findings
 * with advanced LLM-powered analysis to provide comprehensive feedback on code changes.
 * 
 * IMPLEMENTATION GUIDE:
 * 1. Heuristics Pass: Iterate through `input.changedFiles` and check for common patterns 
 *    (e.g., TODOs, large files without tests).
 * 2. LLM Turn: Use `input.agent.runTurn` with the `REVIEW_AGENT_PROMPT` and a formatted 
 *    diff of the changes.
 * 3. Parsing: Implement `parseReviewResponse` to extract structured findings (SUMMARY, NOTE, FINDING) 
 *    from the LLM's text output.
 * 4. Merging: Deduplicate and sort findings from both passes using `dedupeAndSortFindings`.
 */

import type { ReviewSection } from "../types.js";

export interface CodeReviewInput {
  changedFiles: any[];
  fileContexts: any[];
  pullRequestBody: string;
  pullRequestTitle: string;
  repository: string;
  workspaceRoot: string;
  agent: any;
  mode: any;
}

export async function reviewCode(input: CodeReviewInput): Promise<ReviewSection> {
  return {
    source: "code-review",
    title: "Code review",
    summary: "LLM-based code review placeholder.",
    findings: [],
    notes: ["Stage implementation is currently a placeholder."],
  };
}
