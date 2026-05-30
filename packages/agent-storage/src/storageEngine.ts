import Database from "better-sqlite3";
import type { Session, Workspace } from "@excelsior/core";
import { getDb } from "./db.js";
import type { WorkspaceRepository, SessionRepository, StorageEngine } from "./ports.js";

// Private database rows
interface WorkspaceDbRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

interface SessionDbRow {
  id: string;
  started_at: string;
  updated_at: string;
  metadata: string | null;
  workspace_id: string | null;
  title: string | null;
}

interface ExistingSessionRow {
  started_at: string;
  title: string | null;
}

// Map db rows to domain models
function rowToWorkspace(row: WorkspaceDbRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
  };
}

function rowToSession(row: SessionDbRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : { userInput: "" },
    workspaceId: row.workspace_id ?? undefined,
    title: row.title ?? undefined,
  };
}

// Private SQL Queries
const INSERT_SESSION = `
  INSERT OR REPLACE INTO sessions (id, started_at, updated_at, metadata, workspace_id, title)
  VALUES (?, ?, ?, ?, ?, ?)
`;

const SELECT_SESSIONS_BY_WORKSPACE = `
  SELECT id, started_at, updated_at, metadata, workspace_id, title
  FROM sessions
  WHERE workspace_id = ?
    AND (json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1)
  ORDER BY updated_at DESC
`;

const UPDATE_SESSION_TITLE = `
  UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?
`;

const DELETE_SESSION = `
  DELETE FROM sessions 
  WHERE id = ? 
    AND (json_extract(metadata, '$.isChildSession') IS NULL OR json_extract(metadata, '$.isChildSession') != 1)
`;

const DELETE_ALL_SESSIONS = `DELETE FROM sessions`;

const DELETE_PARENT_SESSIONS = `
  DELETE FROM sessions
  WHERE json_extract(metadata, '$.isChildSession') IS NULL
     OR json_extract(metadata, '$.isChildSession') != 1
`;

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly getStoreDb: () => Database.Database = getDb) {}

  create(name: string, rootPath: string): Workspace {
    const storeDb = this.getStoreDb();
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    storeDb
      .prepare(
        "INSERT OR IGNORE INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, name, rootPath, now, now);
    return { id, name, rootPath };
  }

  load(id: string): Workspace | null {
    const storeDb = this.getStoreDb();
    const row = storeDb
      .prepare(
        "SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE id = ?",
      )
      .get(id) as WorkspaceDbRow | undefined;
    return row ? rowToWorkspace(row) : null;
  }

  loadAll(): Workspace[] {
    const storeDb = this.getStoreDb();
    const rows = storeDb
      .prepare(
        "SELECT id, name, root_path, created_at, updated_at FROM workspaces ORDER BY updated_at DESC",
      )
      .all() as WorkspaceDbRow[];
    return rows.map(rowToWorkspace);
  }

  delete(id: string): void {
    const storeDb = this.getStoreDb();
    storeDb.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  }

  getOrCreateDefault(): Workspace {
    const storeDb = this.getStoreDb();
    const row = storeDb
      .prepare(
        "SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE id = 'ws_default'",
      )
      .get() as WorkspaceDbRow | undefined;
    if (row) return rowToWorkspace(row);
    
    // If default workspace doesn't exist, create it
    const id = "ws_default";
    const name = "default";
    const rootPath = process.cwd();
    const now = new Date().toISOString();
    storeDb
      .prepare(
        "INSERT OR IGNORE INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, name, rootPath, now, now);
    return { id, name, rootPath };
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly getStoreDb: () => Database.Database = getDb) {}

  persist(session: Session): void {
    const storeDb = this.getStoreDb();
    const existing = storeDb
      .prepare("SELECT started_at, title FROM sessions WHERE id = ?")
      .get(session.id) as ExistingSessionRow | undefined;

    storeDb
      .prepare(INSERT_SESSION)
      .run(
        session.id,
        existing?.started_at ?? session.startedAt,
        session.updatedAt,
        JSON.stringify(session.metadata ?? {}),
        session.workspaceId ?? null,
        session.title ?? existing?.title ?? null,
      );
  }

  loadByWorkspace(workspaceId: string): Session[] {
    const rows = this.getStoreDb()
      .prepare(SELECT_SESSIONS_BY_WORKSPACE)
      .all(workspaceId) as SessionDbRow[];
    return rows.map(rowToSession);
  }

  updateTitle(sessionId: string, title: string): void {
    this.getStoreDb()
      .prepare(UPDATE_SESSION_TITLE)
      .run(title, new Date().toISOString(), sessionId);
  }

  delete(sessionId: string): void {
    this.getStoreDb().prepare(DELETE_SESSION).run(sessionId);
  }

  deleteAll(includeChildSessions?: boolean): void {
    if (includeChildSessions) {
      this.getStoreDb().exec(DELETE_ALL_SESSIONS);
    } else {
      this.getStoreDb().exec(DELETE_PARENT_SESSIONS);
    }
  }
}

export function createStorageEngine(db?: Database.Database): StorageEngine {
  const getStoreDb = () => db ?? getDb();
  return {
    workspaces: new SqliteWorkspaceRepository(getStoreDb),
    sessions: new SqliteSessionRepository(getStoreDb),
  };
}

export const storageEngine: StorageEngine = createStorageEngine();
