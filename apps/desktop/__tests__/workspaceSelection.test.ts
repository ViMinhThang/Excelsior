import { describe, expect, it } from "vitest";
import type {
  AgentClientState,
  AgentHostIntent,
} from "@excelsior/client";
import type { ExcelsiorApi, WorkspaceTreeNode } from "../src/main/preload.js";
import { selectWorkspaceFolder } from "../src/renderer/hooks/workspaceSelection.js";

function state(): AgentClientState {
  return {
    displayBlocks: [],
    isLoading: false,
    sessions: [],
    currentSessionId: null,
    workspace: { id: "ws", name: "ws", rootPath: "C:/repo" },
    llm: { providerName: "DeepSeek", modelName: "deepseek-v4-flash" },
    mode: "plan",
    pendingConfirmation: null,
    pendingQuestion: null,
  };
}

function apiWithFolder(folderPath: string | null, tree: WorkspaceTreeNode[]): {
  api: ExcelsiorApi;
  initializeCalls: string[];
} {
  const initializeCalls: string[] = [];
  return {
    api: {
      onStateChanged: () => () => {},
      getState: async () => state(),
      getCatalog: async () => ({
        commands: [],
        settings: {
          deepseekApiKey: "",
          githubToken: "",
          agentToolLoopSteps: "unlimited",
        },
      }),
      dispatch: async (_intent: AgentHostIntent) => ({ type: "none" }),
      selectWorkspaceFolder: async () => folderPath,
      initializeWorkspace: async (path: string) => {
        initializeCalls.push(path);
        return state();
      },
      getWorkspaceTree: async () => tree,
      getWorkspaceEnvironment: async () => ({
        rootPath: folderPath,
        branchName: null,
        changeCount: null,
        hasGit: false,
      }),
      changeTheme: () => {},
    },
    initializeCalls,
  };
}

describe("workspace selection", () => {
  it("returns an empty selection when the folder dialog is cancelled", async () => {
    const { api, initializeCalls } = apiWithFolder(null, []);

    await expect(selectWorkspaceFolder(api)).resolves.toEqual({
      workspacePath: null,
      workspaceTree: [],
    });
    expect(initializeCalls).toEqual([]);
  });

  it("initializes the selected workspace and returns its file tree", async () => {
    const tree: WorkspaceTreeNode[] = [
      { name: "src", path: "src", type: "directory", children: [] },
    ];
    const { api, initializeCalls } = apiWithFolder("C:/repo", tree);

    await expect(selectWorkspaceFolder(api)).resolves.toEqual({
      workspacePath: "C:/repo",
      workspaceTree: tree,
    });
    expect(initializeCalls).toEqual(["C:/repo"]);
  });
});
