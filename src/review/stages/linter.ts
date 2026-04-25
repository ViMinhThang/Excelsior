import type { ChangedFile, ReviewSection } from "../types.js";

/**
 * This module performs linting and style checks on the changed files in the workspace.
 * 
 * Implementation Details:
 * 1. Entry Point: Implement `lintCode` which takes `LintInput` (changed files, workspace root).
 * 2. ESLint Integration: Use the `runESLintOnWorkspaceFiles` tool to perform official linting on the paths of all changed files.
 * 3. Heuristic Linting: Implement `collectHeuristicLintFindings` to manually scan added lines for:
 *    - `console.log` statements.
 *    - `debugger` statements.
 *    - Usage of the `any` type in TypeScript.
 *    - Suppressions like `@ts-ignore` or `eslint-disable`.
 * 4. Result Synthesis: Combine results from both ESLint and manual heuristics into a single `ReviewSection` with a summary and notes.
 */

interface LintInput {
  changedFiles: ChangedFile[];
  workspaceRoot: string;
}

export async function lintCode(input: LintInput): Promise<ReviewSection> {
  // TODO: Implement linting logic
  return {
    source: "lint",
    title: "Lint and style",
    summary: "Lint placeholder.",
    findings: [],
    notes: [],
  };
}
