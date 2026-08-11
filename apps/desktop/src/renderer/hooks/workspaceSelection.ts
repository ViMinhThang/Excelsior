import type {
  ExcelsiorApi,
  WorkspaceTreeNode,
} from "../../shared/bridge.js";

export async function selectWorkspaceFolder(api: ExcelsiorApi): Promise<{
  workspacePath: string | null;
  workspaceTree: WorkspaceTreeNode[];
}> {
  if (!api?.selectWorkspaceFolder) {
    throw new Error(
      "Desktop bridge is unavailable. Please run the Electron desktop app, not the browser preview.",
    );
  }

  const folderPath = await api.selectWorkspaceFolder();
  if (!folderPath) {
    return {
      workspacePath: null,
      workspaceTree: [],
    };
  }

  await api.initializeWorkspace(folderPath);
  return {
    workspacePath: folderPath,
    workspaceTree: await api.getWorkspaceTree(),
  };
}
