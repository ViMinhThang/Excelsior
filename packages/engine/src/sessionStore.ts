import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  InteractionState,
  Session,
  SessionState,
  TranscriptBlock,
} from "@excelsior/protocol";

export const CHECKPOINT_VERSION = 2;
export const CHECKPOINT_DEBOUNCE_MS = 250;

interface CheckpointFile {
  version: number;
  session: Session;
  blocks: TranscriptBlock[];
  interaction: InteractionState;
  lastTurnId: string | null;
  updatedAt: number;
}

const EMPTY_INTERACTION: InteractionState = {
  confirmation: null,
  question: null,
};

export class SessionStore {
  private readonly sessionsDir: string;
  private readonly sessions = new Map<string, SessionState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly dirty = new Set<string>();
  private readonly debounceMs: number;

  constructor(
    dataDir: string,
    workspaceId = "default",
    options: { debounceMs?: number } = {},
  ) {
    this.debounceMs = options.debounceMs ?? CHECKPOINT_DEBOUNCE_MS;
    this.sessionsDir = join(dataDir, "sessions", workspaceId);
  }

  private pathFor(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  private getOrLoad(sessionId: string): SessionState | null {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;
    const state = this.readCheckpoint(sessionId);
    if (state) this.sessions.set(sessionId, state);
    return state;
  }

  private readCheckpoint(sessionId: string): SessionState | null {
    const path = this.pathFor(sessionId);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return null;
    }
    let parsed: CheckpointFile;
    try {
      parsed = JSON.parse(raw) as CheckpointFile;
      if (parsed.version !== CHECKPOINT_VERSION) throw new Error("version mismatch");
      if (!parsed.session || !Array.isArray(parsed.blocks)) {
        throw new Error("invalid checkpoint shape");
      }
    } catch {
      try {
        renameSync(path, `${path}.broken`);
      } catch {
        // ignore: recovery rename failed, next write will overwrite
      }
      return null;
    }
    return {
      session: parsed.session,
      blocks: parsed.blocks,
      interaction: parsed.interaction ?? EMPTY_INTERACTION,
      lastTurnId: parsed.lastTurnId ?? null,
    };
  }

  load(sessionId: string): SessionState | null {
    return this.getOrLoad(sessionId);
  }

  list(): Session[] {
    let files: string[] = [];
    try {
      files = readdirSync(this.sessionsDir);
    } catch {
      // no sessions yet
    }
    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith(".broken")) continue;
      const sessionId = file.slice(0, -".json".length);
      if (!this.sessions.has(sessionId)) {
        const state = this.readCheckpoint(sessionId);
        if (state) this.sessions.set(sessionId, state);
      }
    }
    return [...this.sessions.values()]
      .map((state) => state.session)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  create(title: string): SessionState {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      startedAt: now,
      updatedAt: now,
      metadata: { userInput: title },
      title,
    };
    const state: SessionState = {
      session,
      blocks: [],
      interaction: EMPTY_INTERACTION,
      lastTurnId: null,
    };
    this.sessions.set(session.id, state);
    this.checkpoint(session.id);
    return state;
  }

  delete(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
    this.dirty.delete(sessionId);
    this.sessions.delete(sessionId);
    try {
      rmSync(this.pathFor(sessionId));
    } catch {
      // already gone
    }
  }

  rename(sessionId: string, title: string): void {
    const state = this.getOrLoad(sessionId);
    if (!state) return;
    state.session.title = title;
    this.markDirty(sessionId);
  }

  clear(sessionId: string): void {
    const state = this.getOrLoad(sessionId);
    if (!state) return;
    state.blocks = [];
    state.interaction = EMPTY_INTERACTION;
    state.lastTurnId = null;
    this.markDirty(sessionId);
  }

  appendBlocks(sessionId: string, blocks: TranscriptBlock[]): void {
    const state = this.getOrLoad(sessionId);
    if (!state) return;
    state.blocks.push(...blocks);
    state.session.updatedAt = new Date().toISOString();
    this.markDirty(sessionId);
  }

  setInteraction(sessionId: string, interaction: InteractionState): void {
    const state = this.getOrLoad(sessionId);
    if (!state) return;
    state.interaction = interaction;
    this.markDirty(sessionId);
  }

  clearInteraction(sessionId: string): void {
    const state = this.getOrLoad(sessionId);
    if (!state) return;
    state.interaction = EMPTY_INTERACTION;
    this.markDirty(sessionId);
  }

  private markDirty(sessionId: string): void {
    this.dirty.add(sessionId);
    if (this.timers.has(sessionId)) return;
    this.timers.set(
      sessionId,
      setTimeout(() => this.flushSession(sessionId), this.debounceMs),
    );
  }

  checkpoint(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
    this.flushSession(sessionId);
  }

  flush(): void {
    for (const sessionId of [...this.dirty]) this.flushSession(sessionId);
  }

  private flushSession(sessionId: string): void {
    this.timers.delete(sessionId);
    this.dirty.delete(sessionId);
    const state = this.sessions.get(sessionId);
    if (!state) return;
    const file: CheckpointFile = {
      version: CHECKPOINT_VERSION,
      session: state.session,
      blocks: state.blocks,
      interaction: state.interaction,
      lastTurnId: state.lastTurnId,
      updatedAt: Date.now(),
    };
    mkdirSync(this.sessionsDir, { recursive: true });
    const path = this.pathFor(sessionId);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8");
    try {
      renameSync(tmp, path);
    } catch {
      rmSync(tmp, { force: true });
      throw new Error(`failed to checkpoint session ${sessionId}`);
    }
  }
}
