import Database from "better-sqlite3";
import { getDb } from "./db.js";

export interface WorkspaceRow {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export function createWorkspace(
  name: string,
  rootPath: string,
  db?: Database.Database,
): WorkspaceRow {
  const _db = db ?? getDb();
  const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  _db
    .prepare(
      "INSERT OR IGNORE INTO workspaces (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, name, rootPath, now, now);
  return { id, name, rootPath, createdAt: now, updatedAt: now };
}

export function loadWorkspaces(db?: Database.Database): WorkspaceRow[] {
  const _db = db ?? getDb();
  const rows = _db.prepare("SELECT id, name, root_path, created_at, updated_at FROM workspaces ORDER BY updated_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rootPath: r.root_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function loadWorkspace(id: string, db?: Database.Database): WorkspaceRow | null {
  const _db = db ?? getDb();
  const row = _db.prepare("SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE id = ?").get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deleteWorkspace(id: string, db?: Database.Database): void {
  const _db = db ?? getDb();
  _db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}

export function getOrCreateDefaultWorkspace(db?: Database.Database): WorkspaceRow {
  const _db = db ?? getDb();
  const row = _db.prepare("SELECT id, name, root_path, created_at, updated_at FROM workspaces WHERE id = 'ws_default'").get() as any;
  if (row) {
    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return createWorkspace("default", process.cwd(), _db);
}
