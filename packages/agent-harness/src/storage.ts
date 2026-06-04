import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { AppSettings, Session, Workspace } from "@excelsior/core";
import {
  AGENT_TOOL_LOOP_STEPS_SETTING,
  DEFAULT_AGENT_TOOL_LOOP_STEPS,
  normalizeAgentToolLoopSteps,
} from "@excelsior/core";
import { MESSAGE_END, type AnyHarnessEvent } from "./events.js";
import type { HarnessSettings, StoredSessionFile } from "./types.js";

const DEFAULT_SETTINGS: HarnessSettings = {
  deepseekApiKey: "",
  githubToken: "",
  agentToolLoopSteps: DEFAULT_AGENT_TOOL_LOOP_STEPS,
};

type SessionFileLine =
  | { kind: "session"; session: Session }
  | { kind: "event"; event: AnyHarnessEvent };

export class FileHarnessStorage {
  readonly rootDir: string;

  constructor(rootDir = process.env.EXCELSIOR_HARNESS_DATA_DIR ?? join(process.cwd(), "data", "harness")) {
    this.rootDir = resolve(rootDir);
    this.ensureDirectory(this.rootDir);
  }

  loadSettings(): HarnessSettings {
    const raw = this.readJson<Partial<AppSettings>>(this.settingsPath(), {});
    return {
      deepseekApiKey: raw.deepseekApiKey ?? process.env.DEEPSEEK_API_KEY ?? "",
      githubToken: raw.githubToken ?? process.env.GITHUB_TOKEN ?? "",
      agentToolLoopSteps: normalizeAgentToolLoopSteps(
        raw.agentToolLoopSteps ?? process.env[AGENT_TOOL_LOOP_STEPS_SETTING] ?? DEFAULT_SETTINGS.agentToolLoopSteps,
      ),
    };
  }

  saveSettings(settings: Partial<HarnessSettings>): HarnessSettings {
    const current = this.loadSettings();
    const next = {
      ...current,
      ...settings,
      agentToolLoopSteps: normalizeAgentToolLoopSteps(settings.agentToolLoopSteps ?? current.agentToolLoopSteps),
    };
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
    return this.readJson<Workspace[]>(this.workspacesPath(), []);
  }

  listSessions(workspaceId: string): Session[] {
    const dir = this.sessionDirectory(workspaceId);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith(".jsonl"))
      .map((file) => this.loadSessionFile(workspaceId, file.replace(/\.jsonl$/, "")).session)
      .filter((session): session is Session => session !== undefined)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createSession(workspaceId: string, title = "Untitled", userInput = ""): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: `ses_${randomUUID()}`,
      startedAt: now,
      updatedAt: now,
      metadata: { userInput },
      workspaceId,
      title,
    };
    this.writeSessionFile(workspaceId, session, []);
    return session;
  }

  loadSessionFile(workspaceId: string, sessionId: string): Partial<StoredSessionFile> {
    const path = this.sessionPath(workspaceId, sessionId);
    if (!existsSync(path)) return { events: [] };

    const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
    let session: Session | undefined;
    const events: AnyHarnessEvent[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line) as SessionFileLine;
      if (parsed.kind === "session") session = parsed.session;
      if (parsed.kind === "event") events.push(parsed.event);
    }
    return { session, events };
  }

  loadEvents(workspaceId: string, sessionId: string): AnyHarnessEvent[] {
    return this.loadSessionFile(workspaceId, sessionId).events ?? [];
  }

  appendEvent(workspaceId: string, session: Session, event: AnyHarnessEvent): Session {
    const userInput = event.type === MESSAGE_END && event.data.message.role === "user"
      ? event.data.message.content
      : session.metadata.userInput;
    const updated: Session = {
      ...session,
      updatedAt: event.timestamp,
      metadata: session.metadata.userInput
        ? session.metadata
        : {
            ...session.metadata,
            userInput,
          },
    };
    this.appendSessionLines(workspaceId, updated, event);
    return updated;
  }

  replaceEvents(workspaceId: string, session: Session, events: AnyHarnessEvent[]): void {
    const updatedAt = events.at(-1)?.timestamp ?? new Date().toISOString();
    this.writeSessionFile(workspaceId, { ...session, updatedAt }, events);
  }

  renameSession(workspaceId: string, sessionId: string, title: string): Session | null {
    const loaded = this.loadSessionFile(workspaceId, sessionId);
    if (!loaded.session) return null;
    const session = {
      ...loaded.session,
      title,
      updatedAt: new Date().toISOString(),
    };
    this.writeSessionFile(workspaceId, session, loaded.events ?? []);
    return session;
  }

  deleteSession(workspaceId: string, sessionId: string): void {
    const path = this.sessionPath(workspaceId, sessionId);
    if (existsSync(path)) unlinkSync(path);
  }

  deleteAllSessions(workspaceId: string): void {
    const dir = this.sessionDirectory(workspaceId);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".jsonl")) unlinkSync(join(dir, file));
    }
  }

  private writeSessionFile(workspaceId: string, session: Session, events: readonly AnyHarnessEvent[]): void {
    const path = this.sessionPath(workspaceId, session.id);
    this.ensureDirectory(this.sessionDirectory(workspaceId));
    const lines: string[] = [
      JSON.stringify({ kind: "session", session } satisfies SessionFileLine),
      ...events.map((event) => JSON.stringify({ kind: "event", event } satisfies SessionFileLine)),
    ];
    writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
  }

  private appendSessionLines(workspaceId: string, session: Session, event: AnyHarnessEvent): void {
    const path = this.sessionPath(workspaceId, session.id);
    this.ensureDirectory(this.sessionDirectory(workspaceId));
    const lines = [
      JSON.stringify({ kind: "session", session } satisfies SessionFileLine),
      JSON.stringify({ kind: "event", event } satisfies SessionFileLine),
    ];
    appendFileSync(path, `${lines.join("\n")}\n`, "utf-8");
  }

  private settingsPath(): string {
    return join(this.rootDir, "settings.json");
  }

  private workspacesPath(): string {
    return join(this.rootDir, "workspaces.json");
  }

  private sessionDirectory(workspaceId: string): string {
    return join(this.rootDir, "sessions", workspaceId);
  }

  private sessionPath(workspaceId: string, sessionId: string): string {
    return join(this.sessionDirectory(workspaceId), `${sessionId}.jsonl`);
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
