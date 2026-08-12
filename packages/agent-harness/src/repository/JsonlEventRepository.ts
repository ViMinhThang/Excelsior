import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { Session } from "@excelsior/core";
import { sessionSchema } from "@excelsior/core";
import type { AnyHarnessEvent } from "../events.js";
import type { StoredSessionFile } from "../types.js";
import { deriveSession } from "./deriveSession.js";
import type { EventRepository } from "./EventRepository.js";

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

export class JsonlEventRepository implements EventRepository {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir);
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
      session = deriveSession(session, events);
    }
    return { session, events };
  }

  loadEvents(workspaceId: string, sessionId: string): AnyHarnessEvent[] {
    return this.loadSessionFile(workspaceId, sessionId).events ?? [];
  }

  appendEvent(workspaceId: string, session: Session, event: AnyHarnessEvent): Session {
    const updated = deriveSession(session, [event]);
    this.appendSessionLines(workspaceId, updated, event);
    return updated;
  }

  replaceEvents(workspaceId: string, session: Session, events: AnyHarnessEvent[]): void {
    const updated = deriveSession(session, events, new Date().toISOString());
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

  private sessionDirectory(workspaceId: string): string {
    return join(this.rootDir, "sessions", workspaceId);
  }

  private sessionPath(workspaceId: string, sessionId: string): string {
    return join(this.sessionDirectory(workspaceId), `${sessionId}.jsonl`);
  }

  private ensureDirectory(path: string): void {
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
}
