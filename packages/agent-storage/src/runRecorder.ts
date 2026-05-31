import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type {
  AnyAgentEvent,
  DropLastCompletedTurnResult,
  LastCompletedTurn,
  RunEventStore,
  TurnCheckpointStore,
} from "./ports.js";
import {
  completedReplayEvents,
  createTurnCompleteEvent,
  dropLastCompletedTurnFromEvents,
  findLastCompletedTurn,
} from "./runReplayPolicy.js";

export class JsonlRunRecorder implements RunEventStore, TurnCheckpointStore {
  private readonly appendQueues = new Map<string, Promise<void>>();

  constructor(
    public readonly sessionsDir: string = process.env.EXCELSIOR_SESSIONS_DIR ??
      join(process.cwd(), "data", "sessions"),
  ) {}

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.sessionsDir)) {
      await mkdir(this.sessionsDir, { recursive: true });
    }
  }

  private filePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  private async waitForSessionQueue(sessionId: string): Promise<void> {
    await this.appendQueues.get(sessionId)?.catch(() => {});
  }

  private async appendRecordedEvent(
    sessionId: string,
    event: AnyAgentEvent,
  ): Promise<void> {
    const previous = this.appendQueues.get(sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await this.ensureDir();
        await appendFile(this.filePath(sessionId), JSON.stringify(event) + "\n");
      });

    this.appendQueues.set(sessionId, next);

    try {
      await next;
    } finally {
      if (this.appendQueues.get(sessionId) === next) {
        this.appendQueues.delete(sessionId);
      }
    }
  }

  append(sessionId: string, event: AnyAgentEvent): Promise<void> {
    return this.appendRecordedEvent(sessionId, event);
  }

  completeTurn(
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<void> {
    const checkpoint = createTurnCompleteEvent(runId, sequence);
    return this.appendRecordedEvent(sessionId, checkpoint);
  }

  async loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return completedReplayEvents(await this.load(sessionId));
  }

  async load(sessionId: string): Promise<AnyAgentEvent[]> {
    const path = this.filePath(sessionId);
    try {
      const raw = await readFile(path, "utf-8");
      return raw
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as AnyAgentEvent);
    } catch {
      return [];
    }
  }

  async getLastCompletedTurn(
    sessionId: string,
  ): Promise<LastCompletedTurn | null> {
    await this.waitForSessionQueue(sessionId);
    return findLastCompletedTurn(await this.load(sessionId));
  }

  async dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult> {
    await this.waitForSessionQueue(sessionId);
    const events = await this.load(sessionId);
    const { remainingEvents, ...result } = dropLastCompletedTurnFromEvents(
      events,
      expectedRunId,
    );
    if (!result.dropped) return result;

    await this.ensureDir();
    await writeFile(
      this.filePath(sessionId),
      remainingEvents.map((event) => JSON.stringify(event)).join("\n") +
        (remainingEvents.length > 0 ? "\n" : ""),
      "utf-8",
    );

    return result;
  }

  async delete(sessionId: string): Promise<void> {
    await this.waitForSessionQueue(sessionId);
    try {
      await unlink(this.filePath(sessionId));
    } catch {}
  }

  async deleteAll(): Promise<void> {
    await Promise.all(
      [...this.appendQueues.values()].map((queue) => queue.catch(() => {})),
    );
    if (!existsSync(this.sessionsDir)) return;
    const files = await readdir(this.sessionsDir);
    await Promise.all(
      files
        .filter((file) => file.endsWith(".jsonl"))
        .map((file) => unlink(join(this.sessionsDir, file)).catch(() => {})),
    );
  }

  deleteSessionEvents(sessionId: string): Promise<void> {
    return this.delete(sessionId);
  }

  deleteAllSessionEvents(): Promise<void> {
    return this.deleteAll();
  }

  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void> {
    return this.append(sessionId, event);
  }

  recordTurnComplete(
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<void> {
    return this.completeTurn(sessionId, runId, sequence);
  }

  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return this.load(sessionId);
  }
}

export const defaultRunRecorder = new JsonlRunRecorder();
export type RunRecorder = RunEventStore & TurnCheckpointStore & {
  loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  deleteSessionEvents(sessionId: string): Promise<void>;
  deleteAllSessionEvents(): Promise<void>;
  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void>;
  recordTurnComplete(sessionId: string, runId: string, sequence: number): Promise<void>;
  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]>;
};
export const defaultRunStore = defaultRunRecorder;
