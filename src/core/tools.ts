import {
  listWorkspaceEntries,
  readWorkspaceFile,
  searchWorkspaceText,
} from "../tools/read-file.js";

const MAX_TOOL_FILE_CHARS = 12000;

export async function listReviewWorkspace(workspaceRoot: string, relativePath = "."): Promise<string> {
  const entries = await listWorkspaceEntries(workspaceRoot, relativePath);
  return entries.length > 0 ? entries.join("\n") : "(empty directory)";
}

export async function readReviewFile(workspaceRoot: string, relativePath: string): Promise<string> {
  const content = await readWorkspaceFile(workspaceRoot, relativePath);
  return content.length > MAX_TOOL_FILE_CHARS
    ? `${content.slice(0, MAX_TOOL_FILE_CHARS)}\n...<truncated>`
    : content;
}

export async function searchReviewWorkspace(
  workspaceRoot: string,
  query: string,
  relativePath = ".",
): Promise<string> {
  const matches = await searchWorkspaceText(workspaceRoot, query, relativePath);
  return matches.length > 0 ? matches.join("\n") : "(no matches)";
}
