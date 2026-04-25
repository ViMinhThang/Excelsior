import type { ChangedFile, FileContext } from "./types.js";

const MAX_PATCH_CHARS = 5000;
const MAX_CONTEXT_CHARS = 4000;

export const REVIEW_AGENT_PROMPT = `
You are Excelsior's review feature.
Review pull request diffs like a senior engineer.
Focus on correctness, regressions, maintainability risks, and missing validation.
Only report findings when you have concrete evidence in the diff or supplied context.
`.trim();

export const REVIEW_RESPONSE_FORMAT = `
Return plain text in this exact structure:
SUMMARY: <one sentence>
FINDING|<high|medium|low>|<file or ->|<line or ->|<title>|<detail>
NOTE|<supplemental note>

Only emit FINDING lines when you have a concrete issue.
`.trim();

export function buildReviewPrompt(args: {
  changedFiles: ChangedFile[];
  fileContexts: FileContext[];
  pullRequestBody: string;
  pullRequestTitle: string;
  repository: string;
}): string {
  const diffBlocks =
    args.changedFiles.length > 0
      ? args.changedFiles
          .map(
            (file) =>
              `FILE ${file.path}\n${truncate(file.patch, MAX_PATCH_CHARS)}`,
          )
          .join("\n\n")
      : "(no diff available)";

  const contextBlocks =
    args.fileContexts.length > 0
      ? args.fileContexts
          .map(
            (file) =>
              `CONTEXT ${file.path}${file.truncated ? " (truncated)" : ""}\n${truncate(file.content, MAX_CONTEXT_CHARS)}`,
          )
          .join("\n\n")
      : "(no workspace context available)";

  return [
    `Repository: ${args.repository}`,
    `Pull request title: ${args.pullRequestTitle}`,
    `Pull request body:\n${args.pullRequestBody || "(none)"}`,
    "Changed files and diff snippets:",
    diffBlocks,
    "Workspace context:",
    contextBlocks,
    REVIEW_RESPONSE_FORMAT,
  ].join("\n\n");
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n...<truncated>` : value;
}
