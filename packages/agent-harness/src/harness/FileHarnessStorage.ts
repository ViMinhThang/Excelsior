import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import type { AppSettings, Workspace } from "@excelsior/core";
import {
  AGENT_TOOL_LOOP_STEPS_SETTING,
  DEFAULT_APP_SETTINGS,
  appSettingsSchema,
  workspaceSchema,
} from "@excelsior/core";
import type { HarnessSettings } from "../types.js";

export class FileHarnessStorage {
  readonly rootDir: string;

  constructor(rootDir = process.env.EXCELSIOR_HARNESS_DATA_DIR ?? join(process.cwd(), "data", "harness")) {
    this.rootDir = resolve(rootDir);
    this.ensureDirectory(this.rootDir);
  }

  loadSettings(): HarnessSettings {
    const raw = this.readJson<Partial<AppSettings>>(this.settingsPath(), {});
    const candidate = {
      ...raw,
      deepseekApiKey: raw.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY,
      githubToken: raw.githubToken ?? process.env.GITHUB_TOKEN,
      agentToolLoopSteps: raw.agentToolLoopSteps ?? process.env[AGENT_TOOL_LOOP_STEPS_SETTING],
    };
    const parsed = appSettingsSchema.safeParse(candidate);
    return parsed.success ? parsed.data : { ...DEFAULT_APP_SETTINGS };
  }

  saveSettings(settings: Partial<HarnessSettings>): HarnessSettings {
    const current = this.loadSettings();
    const parsed = appSettingsSchema.safeParse({
      ...current,
      ...settings,
    });
    if (!parsed.success) {
      console.warn("Rejected invalid settings update:", parsed.error.issues);
      return current;
    }
    const next = parsed.data;
    this.writeJson(this.settingsPath(), next);
    return next;
  }

  getOrCreateWorkspace(input?: { id?: string; rootPath?: string; name?: string }): Workspace {
    const workspaces = this.loadWorkspaces();
    if (input?.id) {
      const found = workspaces.find((workspace) => workspace.id === input.id);
      if (found) return found;
    }

    const rootPath = resolve(input?.rootPath ?? process.cwd());
    const byRoot = workspaces.find((workspace) => resolve(workspace.rootPath) === rootPath);
    if (byRoot) return byRoot;

    const workspace: Workspace = {
      id: input?.id ?? `ws_${randomUUID()}`,
      name: input?.name ?? (basename(rootPath) || "Excelsior Workspace"),
      rootPath,
    };
    const existingIndex = workspaces.findIndex((item) => item.id === workspace.id);
    const next = existingIndex === -1
      ? [...workspaces, workspace]
      : workspaces.map((item, index) => (index === existingIndex ? workspace : item));
    this.writeJson(this.workspacesPath(), next);
    return workspace;
  }

  loadWorkspaces(): Workspace[] {
    const raw = this.readJson<unknown>(this.workspacesPath(), []);
    const parsed = z.array(workspaceSchema).safeParse(raw);
    return parsed.success ? parsed.data : [];
  }

  reflectionMemoryDirectory(workspaceId: string): string {
    const dir = join(this.rootDir, "memory", workspaceId);
    this.ensureDirectory(dir);
    return dir;
  }

  private settingsPath(): string {
    return join(this.rootDir, "settings.json");
  }

  private workspacesPath(): string {
    return join(this.rootDir, "workspaces.json");
  }

  private readJson<T>(path: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(path: string, value: unknown): void {
    this.ensureDirectory(this.rootDir);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  }

  private ensureDirectory(path: string): void {
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
}
