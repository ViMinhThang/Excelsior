import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { ReflectionClientState } from "@excelsior/core";

export interface ReflectionMemoryState {
  lastReflectedAt?: string;
  lastSummary?: string;
  touchedFiles: string[];
  reviewedSessionIds: string[];
}

const DEFAULT_INDEX = [
  "# Excelsior Reflection Memory",
  "",
  "Durable observations from background reflection runs live here.",
  "",
].join("\n");

const DEFAULT_STATE: ReflectionMemoryState = {
  touchedFiles: [],
  reviewedSessionIds: [],
};

export class ReflectionMemoryStore {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
    this.ensureReady();
  }

  snapshot(status: ReflectionClientState["status"] = "idle", lastSummaryOverride?: string): ReflectionClientState {
    const state = this.readState();
    const lastSummary = lastSummaryOverride ?? state.lastSummary;
    return {
      status,
      ...(state.lastReflectedAt ? { lastRunAt: state.lastReflectedAt } : {}),
      ...(lastSummary ? { lastSummary } : {}),
      touchedFiles: state.touchedFiles,
      memoryRoot: this.rootDir,
    };
  }

  readState(): ReflectionMemoryState {
    this.ensureReady();
    try {
      const raw = JSON.parse(readFileSync(this.statePath(), "utf-8")) as Partial<ReflectionMemoryState>;
      return {
        ...DEFAULT_STATE,
        ...raw,
        touchedFiles: Array.isArray(raw.touchedFiles) ? raw.touchedFiles : [],
        reviewedSessionIds: Array.isArray(raw.reviewedSessionIds) ? raw.reviewedSessionIds : [],
      };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  writeState(state: ReflectionMemoryState): void {
    mkdirSync(this.rootDir, { recursive: true });
    writeFileSync(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  }

  recordSuccess(input: {
    reflectedAt: string;
    summary: string;
    touchedFiles: string[];
    reviewedSessionIds: string[];
  }): void {
    const current = this.readState();
    this.writeState({
      ...current,
      lastReflectedAt: input.reflectedAt,
      lastSummary: input.summary,
      touchedFiles: [...new Set(input.touchedFiles)].sort(),
      reviewedSessionIds: [...new Set(input.reviewedSessionIds)].sort(),
    });
  }

  listMemoryFiles(): string[] {
    this.ensureReady();
    return this.listMarkdownFiles(this.rootDir).sort();
  }

  readMemoryFile(filePath: string): string {
    const { fullPath } = this.resolveMemoryFile(filePath, { requireMarkdown: true });
    if (!existsSync(fullPath)) {
      throw new Error(`Memory file does not exist: ${filePath}`);
    }
    return readFileSync(fullPath, "utf-8");
  }

  writeMemoryFile(filePath: string, content: string): string {
    const { fullPath, relativePath } = this.resolveMemoryFile(filePath, { requireMarkdown: true });
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
    return relativePath;
  }

  private ensureReady(): void {
    mkdirSync(resolve(this.rootDir, "topics"), { recursive: true });
    if (!existsSync(this.indexPath())) {
      writeFileSync(this.indexPath(), DEFAULT_INDEX, "utf-8");
    }
    if (!existsSync(this.statePath())) {
      writeFileSync(this.statePath(), `${JSON.stringify(DEFAULT_STATE, null, 2)}\n`, "utf-8");
    }
  }

  private listMarkdownFiles(currentDir: string): string[] {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.listMarkdownFiles(fullPath));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        files.push(this.toRelativePath(fullPath));
      }
    }
    return files;
  }

  private resolveMemoryFile(
    filePath: string,
    options: { requireMarkdown: boolean },
  ): { fullPath: string; relativePath: string } {
    const normalized = filePath.trim().replace(/\\/g, "/");
    if (!normalized) throw new Error("Memory file path is required.");
    if (isAbsolute(normalized)) throw new Error(`Memory path must be relative: ${filePath}`);
    if (normalized.split("/").includes("..")) {
      throw new Error(`Memory path cannot traverse outside the memory root: ${filePath}`);
    }
    if (options.requireMarkdown && extname(normalized).toLowerCase() !== ".md") {
      throw new Error(`Memory file must be a markdown file: ${filePath}`);
    }

    const fullPath = resolve(this.rootDir, normalized);
    if (this.isOutsideRoot(fullPath)) {
      throw new Error(`Memory path is outside the memory root: ${filePath}`);
    }
    return { fullPath, relativePath: this.toRelativePath(fullPath) };
  }

  private isOutsideRoot(fullPath: string): boolean {
    const rel = relative(this.rootDir, fullPath);
    return rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel);
  }

  private toRelativePath(fullPath: string): string {
    return relative(this.rootDir, fullPath).replace(/\\/g, "/");
  }

  private indexPath(): string {
    return resolve(this.rootDir, "index.md");
  }

  private statePath(): string {
    return resolve(this.rootDir, "state.json");
  }
}
