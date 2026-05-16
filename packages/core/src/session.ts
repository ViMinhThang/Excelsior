export interface Session {
  id: string;
  startedAt: string;
  updatedAt: string;
  metadata: { userInput: string } & Record<string, unknown>;
  workspaceId?: string;
  title?: string;
}

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
}
