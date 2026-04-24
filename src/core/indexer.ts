import glob from "fast-glob";
import { promises as fs } from "node:fs";
import { globalMemory } from "./memory-manager.js";

export async function indexCodebase(workspaceRoot: string) {
  const db = (globalMemory as any).db;
  if (!db) {
    await globalMemory.init();
  }

  const files = await glob("**/*", {
    cwd: workspaceRoot,
    ignore: ["node_modules/**", ".git/**", "dist/**", ".excelsior/**"],
    stats: true,
  });

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO files (path, last_modified)
    VALUES (?, ?)
  `);

  const transaction = db.transaction((fileList: any[]) => {
    for (const file of fileList) {
      insertStmt.run(file.path, file.stats.mtime.toISOString());
    }
  });

  transaction(files);

  globalMemory.addObservation("Indexer", `Indexed ${files.length} files in the workspace.`);
}

export function searchFiles(query: string): string[] {
  const db = (globalMemory as any).db;
  if (!db) return [];

  const stmt = db.prepare("SELECT path FROM files WHERE path LIKE ? LIMIT 20");
  const rows = stmt.all(`%${query}%`) as { path: string }[];
  return rows.map(r => r.path);
}

export function getProjectSummary(): string {
  const db = (globalMemory as any).db;
  if (!db) return "No index available.";

  const countStmt = db.prepare("SELECT COUNT(*) as count FROM files");
  const { count } = countStmt.get() as { count: number };

  const recentStmt = db.prepare("SELECT path FROM files ORDER BY last_modified DESC LIMIT 10");
  const recent = recentStmt.all() as { path: string }[];

  return `Project has ${count} files. Recently modified: ${recent.map(r => r.path).join(", ")}`;
}
