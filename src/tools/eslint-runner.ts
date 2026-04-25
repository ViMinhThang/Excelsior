/**
 * This tool integrates with ESLint to analyze source code for potential issues and style violations.
 * 
 * Implementation Details:
 * 1. Data Structures: Define a `LintIssue` interface containing `filePath`, `line`, `column`, `severity` (low/medium), 
 *    `ruleId`, and `message`.
 * 2. File Filtering: Implement `isLintableFile` to check for supported extensions (.js, .jsx, .ts, .tsx, etc.).
 * 3. ESLint Integration: Implement `runESLintOnWorkspaceFiles` which:
 *    - Resolves absolute paths for a set of target files within the `workspaceRoot`.
 *    - Initializes an `ESLint` instance with the workspace root as the working directory.
 *    - Runs the linter and transforms the raw results into an array of `LintIssue` objects.
 *    - Filters out issues with no severity and maps ESLint severity (1/2) to "low" or "medium".
 */
