import type {
  AgentClientState,
  AgentHostCatalog,
  AgentHostDispatchResult,
  AgentHostIntent,
} from "@excelsior/client";

export const IPC_CHANNELS = {
  hostStateChanged: "host:state-changed",
  hostGetState: "host:get-state",
  hostGetCatalog: "host:get-catalog",
  hostDispatch: "host:dispatch",
  hostInitializeWorkspace: "host:initialize-workspace",
  dialogSelectWorkspaceFolder: "dialog:select-workspace-folder",
  workspaceGetTree: "workspace:get-tree",
  workspaceGetEnvironment: "workspace:get-environment",
  themeChanged: "theme:changed",
} as const;

export type WorkspaceTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

export type WorkspaceEnvironmentInfo = {
  rootPath: string | null;
  branchName: string | null;
  changeCount: number | null;
  hasGit: boolean;
};

export interface ExcelsiorApi {
  onStateChanged(callback: (state: AgentClientState) => void): () => void;
  getState(): Promise<AgentClientState>;
  getCatalog(): Promise<AgentHostCatalog>;
  dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult>;
  selectWorkspaceFolder(): Promise<string | null>;
  initializeWorkspace(path: string): Promise<AgentClientState>;
  getWorkspaceTree(): Promise<WorkspaceTreeNode[]>;
  getWorkspaceEnvironment(): Promise<WorkspaceEnvironmentInfo>;
  changeTheme(theme: string): void;
}
