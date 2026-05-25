import fs from "fs";
import path from "path";
import type { AgentClientState } from "@excelsior/client";
import {
  AgentApplication,
  storageEngine,
  LocalAgentHost,
} from "@excelsior/agent-host";
import type { Workspace } from "@excelsior/core";

export type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

const IGNORED_TREE_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
]);
const MAX_TREE_DEPTH = 4;
const MAX_TREE_ENTRIES_PER_DIR = 80;

export function buildWorkspaceTree(
  rootPath: string,
  dirPath = rootPath,
  depth = 0,
): WorkspaceTreeNode[] {
  if (depth > MAX_TREE_DEPTH) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !IGNORED_TREE_NAMES.has(entry.name) && !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, MAX_TREE_ENTRIES_PER_DIR);

  return entries.map((entry) => {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
    const isDirectory = entry.isDirectory();

    return {
      name: entry.name,
      path: relativePath,
      type: isDirectory ? "directory" : "file",
      ...(isDirectory
        ? { children: buildWorkspaceTree(rootPath, absolutePath, depth + 1) }
        : {}),
    };
  });
}

export class DesktopWorkspaceHost {
  private agentHost: LocalAgentHost | null = null;
  private stateChangeUnsubscribe: (() => void) | null = null;
  private currentWorkspaceRoot: string | null = null;

  constructor(
    private readonly onStateChanged: (state: AgentClientState) => void,
  ) {}

  initializeWorkspace(rootPath: string): AgentClientState {
    this.disposeHost();

    const workspaces = storageEngine.workspaces.loadAll();
    let workspace: Workspace | undefined = workspaces.find((item: Workspace) =>
      path.resolve(item.rootPath) === path.resolve(rootPath)
    );

    if (!workspace) {
      const workspaceName = path.basename(rootPath) || "Excelsior Workspace";
      workspace = storageEngine.workspaces.create(workspaceName, rootPath);
    }

    this.currentWorkspaceRoot = rootPath;
    const application = new AgentApplication(workspace.id);
    this.agentHost = new LocalAgentHost(application);
    this.stateChangeUnsubscribe = this.agentHost.subscribe(() => {
      if (this.agentHost) {
        this.onStateChanged(this.agentHost.getState());
      }
    });

    return this.agentHost.getState();
  }

  getWorkspaceTree(): WorkspaceTreeNode[] {
    return this.currentWorkspaceRoot
      ? buildWorkspaceTree(this.currentWorkspaceRoot)
      : [];
  }

  requireHost(): LocalAgentHost {
    if (!this.agentHost) {
      throw new Error("Excelsior Agent Host is not yet initialized. Please select a workspace.");
    }
    return this.agentHost;
  }

  dispose(): void {
    this.disposeHost();
  }

  private disposeHost(): void {
    this.stateChangeUnsubscribe?.();
    this.stateChangeUnsubscribe = null;
    this.agentHost?.dispose();
    this.agentHost = null;
  }
}
