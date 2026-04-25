/**
 * Performs lightweight heuristic-based lint and style checks on changed lines
 * to identify common anti-patterns such as debug logging or loose type usage.
 * 
 * IMPLEMENTATION GUIDE:
 * 1. Rule Definition: Define a set of regex-based rules (e.g., /console\.log/, /: any/, /debugger/).
 * 2. Scan: Iterate through all `addedLines` in `input.changedFiles`.
 * 3. Match: For each line, test against all rules.
 * 4. Finding Creation: Transform matches into `ReviewFinding` objects with appropriate 
 *    severity and detail messages.
 */

import type { ReviewSection } from "../types.js";

export interface LintInput {
  changedFiles: any[];
  workspaceRoot: string;
}

export async function lintCode(input: LintInput): Promise<ReviewSection> {
  return {
    source: "lint",
    title: "Lint and style",
    summary: "Heuristic linting placeholder.",
    findings: [],
    notes: ["Stage implementation is currently a placeholder."],
  };
}
