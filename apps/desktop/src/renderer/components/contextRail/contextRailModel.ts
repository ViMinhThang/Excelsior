import type { ProjectedBlock } from "@excelsior/core";
import type { WorkspaceEnvironmentInfo } from "../../../main/preload.js";

export type DesktopContextSnippet = {
  id: string;
  role: "user" | "assistant";
  title: string;
  content: string;
};

export type DesktopContextState = {
  storageKey: string;
  notes: string;
  pinnedSnippetIds: string[];
};

const MAX_SNIPPETS = 8;
const MAX_SNIPPET_CONTENT_CHARS = 700;
const MAX_SNIPPET_TITLE_CHARS = 64;
const STORAGE_PREFIX = "excelsior-context-rail";

export function contextRailStorageKey(workspacePath: string, sessionId: string | null): string {
  return `${STORAGE_PREFIX}:${workspacePath}:${sessionId ?? "no-session"}`;
}

export function emptyDesktopContextState(storageKey: string): DesktopContextState {
  return {
    storageKey,
    notes: "",
    pinnedSnippetIds: [],
  };
}

export function readDesktopContextState(storage: Storage, storageKey: string): DesktopContextState {
  const emptyState = emptyDesktopContextState(storageKey);
  const raw = storage.getItem(storageKey);
  if (!raw) return emptyState;

  try {
    const parsed = JSON.parse(raw) as Partial<DesktopContextState>;
    return {
      storageKey,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      pinnedSnippetIds: Array.isArray(parsed.pinnedSnippetIds)
        ? parsed.pinnedSnippetIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return emptyState;
  }
}

export function writeDesktopContextState(storage: Storage, state: DesktopContextState): void {
  storage.setItem(state.storageKey, JSON.stringify({
    notes: state.notes,
    pinnedSnippetIds: state.pinnedSnippetIds,
  }));
}

export function buildDesktopContextSnippets(blocks: readonly ProjectedBlock[]): DesktopContextSnippet[] {
  return blocks
    .filter((block): block is Extract<ProjectedBlock, { type: "user" | "assistant" }> =>
      block.type === "user" || block.type === "assistant"
    )
    .slice(-MAX_SNIPPETS)
    .map((block) => ({
      id: block.id,
      role: block.type,
      title: titleForBlock(block.type, block.content),
      content: truncateText(block.content, MAX_SNIPPET_CONTENT_CHARS),
    }));
}

export function togglePinnedSnippetId(ids: readonly string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((item) => item !== id)
    : [...ids, id];
}

export function selectedDesktopContextSnippets(
  snippets: readonly DesktopContextSnippet[],
  pinnedSnippetIds: readonly string[],
): DesktopContextSnippet[] {
  const pinned = new Set(pinnedSnippetIds);
  return snippets.filter((snippet) => pinned.has(snippet.id));
}

export function buildDesktopContextPrompt(input: {
  basePrompt: string;
  environment: WorkspaceEnvironmentInfo | null;
  workspaceName?: string;
  pinnedSnippets: readonly DesktopContextSnippet[];
  notes: string;
}): string {
  const notes = input.notes.trim();
  const hasEnvironment = Boolean(input.environment || input.workspaceName);
  const hasPinnedSnippets = input.pinnedSnippets.length > 0;
  if (!hasEnvironment && !hasPinnedSnippets && !notes) return input.basePrompt;

  const sections = ["## Desktop Context"];

  if (hasEnvironment) {
    const environmentLines = [
      input.workspaceName ? `Workspace: ${input.workspaceName}` : null,
      input.environment?.rootPath ? `Path: ${input.environment.rootPath}` : null,
      input.environment?.hasGit && input.environment.branchName
        ? `Branch: ${input.environment.branchName}`
        : null,
      input.environment?.changeCount !== null && input.environment?.changeCount !== undefined
        ? `Local changes: ${input.environment.changeCount}`
        : null,
    ].filter((line): line is string => Boolean(line));

    if (environmentLines.length > 0) {
      sections.push(["### Environment", ...environmentLines].join("\n"));
    }
  }

  if (hasPinnedSnippets) {
    sections.push([
      "### Pinned Messages",
      ...input.pinnedSnippets.map((snippet) =>
        `- ${snippet.role === "user" ? "User" : "Assistant"}: ${snippet.content}`
      ),
    ].join("\n"));
  }

  if (notes) {
    sections.push(["### Notes", notes].join("\n"));
  }

  return `${sections.join("\n\n")}\n\n## User Request\n${input.basePrompt}`;
}

function titleForBlock(role: DesktopContextSnippet["role"], content: string): string {
  const firstLine = content.trim().replace(/\s+/g, " ");
  const title = truncateText(firstLine || "Untitled", MAX_SNIPPET_TITLE_CHARS);
  return `${role === "user" ? "You" : "Assistant"}: ${title}`;
}

function truncateText(text: string, maxChars: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars - 1)}...`
    : normalized;
}
