import { useCallback, useState } from "react";
import type {
  ExcelsiorApi,
  WorkspaceEnvironmentInfo,
  WorkspaceTreeNode,
} from "../../main/preload.js";
import { selectWorkspaceFolder } from "./workspaceSelection.js";

export function useDesktopWorkspaceHost(api: ExcelsiorApi) {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [workspaceEnvironment, setWorkspaceEnvironment] =
    useState<WorkspaceEnvironmentInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const refreshWorkspaceEnvironment = useCallback(async () => {
    setWorkspaceEnvironment(await api.getWorkspaceEnvironment());
  }, [api]);

  const selectWorkspace = useCallback(async () => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      const result = await selectWorkspaceFolder(api);
      if (result.workspacePath) {
        setWorkspacePath(result.workspacePath);
        setWorkspaceTree(result.workspaceTree);
        await refreshWorkspaceEnvironment();
      }
    } catch (err) {
      console.error("Workspace selection failed:", err);
      setWorkspaceError(
        err instanceof Error ? err.message : "Workspace selection failed.",
      );
    } finally {
      setIsInitializing(false);
    }
  }, [api, refreshWorkspaceEnvironment]);

  const switchWorkspace = useCallback(async (path: string) => {
    setIsInitializing(true);
    setWorkspaceError(null);
    try {
      await api.initializeWorkspace(path);
      setWorkspaceTree(await api.getWorkspaceTree());
      await refreshWorkspaceEnvironment();
      setWorkspacePath(path);
    } catch (err) {
      console.error("Failed to switch workspace:", err);
      setWorkspaceError(
        err instanceof Error ? err.message : "Failed to switch workspace.",
      );
    } finally {
      setIsInitializing(false);
    }
  }, [api, refreshWorkspaceEnvironment]);

  return {
    workspacePath,
    workspaceTree,
    workspaceEnvironment,
    isInitializing,
    workspaceError,
    refreshWorkspaceEnvironment,
    selectWorkspace,
    switchWorkspace,
  };
}
