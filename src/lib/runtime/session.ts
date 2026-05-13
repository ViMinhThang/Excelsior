export interface Session {
  id: string;
  startedAt: string;
  updatedAt: string;
  metadata: { userInput: string } & Record<string, unknown>;
  workspaceId?: string;
  title?: string;
}
