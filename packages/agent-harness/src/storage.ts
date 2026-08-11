import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import type { AppSettings, Session, Workspace } from "@excelsior/core";
import {
  AGENT_TOOL_LOOP_STEPS_SETTING,
  DEFAULT_APP_SETTINGS,
  appSettingsSchema,
  sessionSchema,
  workspaceSchema,
} from "@excelsior/core";
import { MESSAGE_END, type AnyHarnessEvent } from "./events.js";
import type { HarnessSettings, StoredSessionFile } from "./types.js";

type SessionFileLine =
  | { kind: "session"; session: Session }
  | { kind: "event"; event: AnyHarnessEvent };

const sessionFileLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("session"), session: sessionSchema }),
  z.object({
    kind: z.literal("event"),
    event: z.object({
      type: z.string().min(1),
      timestamp: z.string().min(1),
      data: z.record(z.string(), z.unknown()).default({}),
    }).passthrough(),
  }),
]);

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
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const parsed = sessionFileLineSchema.safeParse(raw);
      if (!parsed.success) continue;
      if (parsed.data.kind === "session") {
        session = parsed.data.session as Session;
      } else {
        events.push(parsed.data.event as unknown as AnyHarnessEvent);
      }
    }
    if (session) {
      session = this.deriveSession(session, events);
    }
    return { session, events };
  }

  loadEvents(workspaceId: string, sessionId: string): AnyHarnessEvent[] {
    return this.loadSessionFile(workspaceId, sessionId).events ?? [];
  }

  appendEvent(workspaceId: string, session: Session, event: AnyHarnessEvent): Session {
    const updated = this.deriveSession(session, [event]);
    this.appendSessionLines(workspaceId, updated, event);
    return updated;
  }

  replaceEvents(workspaceId: string, session: Session, events: AnyHarnessEvent[]): void {
    const updated = this.deriveSession(session, events, new Date().toISOString());
    this.writeSessionFile(workspaceId, updated, events);
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

  reflectionMemoryDirectory(workspaceId: string): string {
    const dir = join(this.rootDir, "memory", workspaceId);
    this.ensureDirectory(dir);
    return dir;
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
    appendFileSync(path, `${JSON.stringify({ kind: "event", event } satisfies SessionFileLine)}\n`, "utf-8");
  }

  private deriveSession(
    session: Session,
    events: readonly AnyHarnessEvent[],
    updatedAtFallback: string = session.updatedAt,
  ): Session {
    let userInput = session.metadata.userInput;
    if (!userInput) {
      const firstUserMessage = events.find(
        (event): event is Extract<AnyHarnessEvent, { type: typeof MESSAGE_END }> =>
          event.type === MESSAGE_END && event.data.message.role === "user",
      );
      userInput = firstUserMessage?.data.message.content ?? "";
    }
    return {
      ...session,
      updatedAt: events.at(-1)?.timestamp ?? updatedAtFallback,
      metadata: {
        ...session.metadata,
        userInput,
      },
    };
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
