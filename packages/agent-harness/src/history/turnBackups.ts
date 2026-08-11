import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { resolve } from "node:path";
import path from "node:path";
import { turnBackupManifestSchema } from "@excelsior/core";

interface TurnBackupManifestEntry {
  path: string;
  action: "modify" | "create";
}

function readManifest(manifestPath: string): TurnBackupManifestEntry[] {
  try {
    const parsed = turnBackupManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf-8")));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function recordTurnBackup(input: {
  backupDir?: string;
  relativePath: string;
  fullPath: string;
}): Promise<void> {
  if (!input.backupDir) return;

  const manifestPath = path.join(input.backupDir, "manifest.json");
  let manifest: TurnBackupManifestEntry[] = [];
  if (existsSync(manifestPath)) {
    manifest = readManifest(manifestPath);
  }

  if (manifest.some((entry) => entry.path === input.relativePath)) {
    return;
  }

  const exists = existsSync(input.fullPath);
  if (exists) {
    const backupPath = path.join(input.backupDir, input.relativePath);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, await fs.readFile(input.fullPath, "utf-8"), "utf-8");
    manifest.push({ path: input.relativePath, action: "modify" });
  } else {
    manifest.push({ path: input.relativePath, action: "create" });
  }

  await fs.mkdir(input.backupDir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

export function restoreTurnBackups(input: {
  storageRoot: string;
  workspaceRoot: string;
  workspaceId: string;
  sessionId: string;
  turnId?: string;
}): void {
  if (!input.turnId) return;
  const backupDir = resolve(input.storageRoot, "backups", input.workspaceId, input.sessionId, input.turnId);
  const manifestPath = resolve(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) return;

  try {
    const manifest = readManifest(manifestPath);
    for (const entry of manifest) {
      const workspacePath = resolve(input.workspaceRoot, entry.path);
      if (entry.action === "modify") {
        const backupFilePath = resolve(backupDir, entry.path);
        if (existsSync(backupFilePath)) {
          writeFileSync(workspacePath, readFileSync(backupFilePath, "utf-8"), "utf-8");
        }
      } else if (entry.action === "create" && existsSync(workspacePath)) {
        unlinkSync(workspacePath);
      }
    }
  } catch (err) {
    console.error("Failed to restore backups:", err);
  }
}
