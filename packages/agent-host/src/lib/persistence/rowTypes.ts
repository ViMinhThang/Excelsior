import type { Session } from "@excelsior/core";
import type { WorkspaceRow } from "./workspaceStore.js";

export interface WorkspaceDbRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

export interface SessionDbRow {
  id: string;
  started_at: string;
  updated_at: string;
  metadata: string | null;
  workspace_id: string | null;
  title: string | null;
}

export function rowToWorkspace(row: WorkspaceDbRow): WorkspaceRow {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToSession(row: SessionDbRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
    workspaceId: row.workspace_id ?? undefined,
    title: row.title ?? undefined,
  };
}
