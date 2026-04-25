import type { ReviewModelClient } from "../../core/provider.js";
import type { ChangedFile, FileContext, ReviewSection } from "../types.js";

/**
 * This module performs a high-level code review by combining heuristic checks with LLM-assisted analysis.
 * 
 * Implementation Details:
 * 1. Entry Point: Implement `reviewCode` which takes `CodeReviewInput` (changed files, context, PR metadata, provider).
 * 2. Heuristics: Implement `collectHeuristicFindings` to detect:
 *    - Substantial code additions (>120 lines) without corresponding test file updates.
 *    - New TODO or FIXME comments in the code.
 * 3. LLM Integration: If a provider is available:
 *    - Build a prompt containing the PR title, body, diff patches (truncated), and workspace context.
 *    - Use the provider to generate a structured review.
 *    - Parse the response (SUMMARY:, NOTE|, FINDING|) into a structured `ReviewSection`.
 * 4. Error Handling: Ensure the pass falls back gracefully to heuristics if the LLM provider fails or is unconfigured.
 */

interface CodeReviewInput {
  changedFiles: ChangedFile[];
  fileContexts: FileContext[];
  pullRequestBody: string;
  pullRequestTitle: string;
  repository: string;
  workspaceRoot: string;
  provider: ReviewModelClient | null;
}

export async function reviewCode(input: CodeReviewInput): Promise<ReviewSection> {
  // TODO: Implement code review logic
  return {
    source: "code-review",
    title: "Code review",
    summary: "Code review placeholder.",
    findings: [],
    notes: [],
  };
}
