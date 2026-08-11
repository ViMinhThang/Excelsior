import type { WorkspaceEnvironmentInfo } from "../../../shared/bridge.js";

export type DesktopContextState = {
  storageKey: string;
  notes: string;
};

const STORAGE_PREFIX = "excelsior-context-rail";

export function contextRailStorageKey(workspacePath: string, sessionId: string | null): string {
  return `${STORAGE_PREFIX}:${workspacePath}:${sessionId ?? "no-session"}`;
}

export function emptyDesktopContextState(storageKey: string): DesktopContextState {
  return {
    storageKey,
    notes: "",
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
    };
  } catch {
    return emptyState;
  }
}

export function writeDesktopContextState(storage: Storage, state: DesktopContextState): void {
  storage.setItem(state.storageKey, JSON.stringify({
    notes: state.notes,
  }));
}

export function buildDesktopContextPrompt(input: {
  basePrompt: string;
  environment: WorkspaceEnvironmentInfo | null;
  workspaceName?: string;
  notes: string;
}): string {
  const notes = input.notes.trim();
  const hasEnvironment = Boolean(input.environment || input.workspaceName);
  if (!hasEnvironment && !notes) return input.basePrompt;

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

  if (notes) {
    sections.push(["### Notes", notes].join("\n"));
  }

  return `${sections.join("\n\n")}\n\n## User Request\n${input.basePrompt}`;
}
