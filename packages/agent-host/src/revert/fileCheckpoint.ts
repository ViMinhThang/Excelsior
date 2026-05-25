import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface FileCheckpointEntry {
  filePath: string;
  fullPath: string;
  existed: boolean;
  originalContent: string | null;
  expectedContent: string;
}

export interface CompletedFileCheckpoint {
  sessionId: string;
  runId: string;
  entries: FileCheckpointEntry[];
}

export interface FileCheckpointConflict {
  filePath: string;
  fullPath: string;
  reason: string;
}

export interface FileCheckpointRestoreResult {
  restored: FileCheckpointEntry[];
  conflicts: FileCheckpointConflict[];
}

interface ActiveFileCheckpointEntry {
  filePath: string;
  fullPath: string;
  existed: boolean;
  originalContent: string | null;
  expectedContent: string | null;
}

interface ActiveFileCheckpoint {
  sessionId: string;
  runId: string;
  entries: Map<string, ActiveFileCheckpointEntry>;
}

function keyForPath(fullPath: string): string {
  return process.platform === "win32" ? fullPath.toLowerCase() : fullPath;
}

export class FileCheckpoint {
  private active: ActiveFileCheckpoint | null = null;
  private latest: CompletedFileCheckpoint | null = null;

  beginTurn(sessionId: string, runId: string): void {
    this.latest = null;
    this.active = {
      sessionId,
      runId,
      entries: new Map(),
    };
  }

  discardActiveTurn(runId?: string): void {
    if (runId && this.active?.runId !== runId) return;
    this.active = null;
  }

  completeTurn(sessionId: string, runId: string): void {
    if (!this.active || this.active.sessionId !== sessionId || this.active.runId !== runId) {
      return;
    }

    const entries = [...this.active.entries.values()]
      .filter((entry): entry is ActiveFileCheckpointEntry & { expectedContent: string } =>
        entry.expectedContent !== null,
      )
      .map((entry) => ({
        filePath: entry.filePath,
        fullPath: entry.fullPath,
        existed: entry.existed,
        originalContent: entry.originalContent,
        expectedContent: entry.expectedContent,
      }));

    this.latest = entries.length > 0 ? { sessionId, runId, entries } : null;
    this.active = null;
  }

  getLatest(): CompletedFileCheckpoint | null {
    return this.latest;
  }

  clearLatest(): void {
    this.latest = null;
  }

  async captureBeforeWrite(filePath: string, fullPath: string): Promise<void> {
    if (!this.active) return;

    const key = keyForPath(fullPath);
    if (this.active.entries.has(key)) return;

    try {
      const originalContent = await readFile(fullPath, "utf-8");
      this.active.entries.set(key, {
        filePath,
        fullPath,
        existed: true,
        originalContent,
        expectedContent: null,
      });
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
      this.active.entries.set(key, {
        filePath,
        fullPath,
        existed: false,
        originalContent: null,
        expectedContent: null,
      });
    }
  }

  recordWrite(filePath: string, fullPath: string, expectedContent: string): void {
    if (!this.active) return;

    const key = keyForPath(fullPath);
    const entry = this.active.entries.get(key);
    if (!entry) return;

    entry.filePath = filePath;
    entry.fullPath = fullPath;
    entry.expectedContent = expectedContent;
  }

  async restoreLatest(): Promise<FileCheckpointRestoreResult> {
    if (!this.latest) return { restored: [], conflicts: [] };

    const conflicts = await this.findConflicts(this.latest.entries);
    if (conflicts.length > 0) {
      return { restored: [], conflicts };
    }

    for (const entry of this.latest.entries) {
      if (entry.existed) {
        await mkdir(path.dirname(entry.fullPath), { recursive: true });
        await writeFile(entry.fullPath, entry.originalContent ?? "", "utf-8");
      } else {
        await rm(entry.fullPath, { force: true });
      }
    }

    return { restored: this.latest.entries, conflicts: [] };
  }

  private async findConflicts(
    entries: FileCheckpointEntry[],
  ): Promise<FileCheckpointConflict[]> {
    const conflicts: FileCheckpointConflict[] = [];

    for (const entry of entries) {
      try {
        const currentContent = await readFile(entry.fullPath, "utf-8");
        if (currentContent !== entry.expectedContent) {
          conflicts.push({
            filePath: entry.filePath,
            fullPath: entry.fullPath,
            reason: "file changed after the agent turn",
          });
        }
      } catch (error: unknown) {
        if (!isMissingFileError(error)) throw error;
        if (entry.existed) {
          conflicts.push({
            filePath: entry.filePath,
            fullPath: entry.fullPath,
            reason: "file is missing after the agent turn",
          });
        }
      }
    }

    return conflicts;
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
