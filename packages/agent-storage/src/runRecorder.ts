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
  RunEventStore,
  TurnCheckpointStore,
  LastCompletedTurn,
  DropLastCompletedTurnResult,
} from "./ports.js";

const TURN_COMPLETE = "turn-complete";

function makeEvent(
  runId: string,
  type: string,
  data: unknown,
  sequence: number,
): AnyAgentEvent {
  return {
    id: `evt_chk_${Math.random().toString(36).substring(2, 11)}`,
    runId,
    sequence,
    type,
    version: 1,
    causationId: "",
    correlationId: runId,
    timestamp: new Date().toISOString(),
    data,
  };
}

function timestampMs(event: AnyAgentEvent): number {
  const parsed = Date.parse(event.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortEventsForReplay(events: AnyAgentEvent[]): AnyAgentEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      if (a.event.runId === b.event.runId) {
        return a.event.sequence - b.event.sequence || a.index - b.index;
      }
      return timestampMs(a.event) - timestampMs(b.event) || a.index - b.index;
    })
    .map(({ event }) => event);
}

function turnCompleteRunId(event: AnyAgentEvent): string | null {
  if (event.type !== TURN_COMPLETE) return null;
  return (event.data as { runId?: string }).runId ?? null;
}

function belongsToCompletedRun(
  event: AnyAgentEvent,
  completedRunIds: Set<string>,
): boolean {
  const checkpointRunId = turnCompleteRunId(event);
  if (checkpointRunId) return completedRunIds.has(checkpointRunId);

  return (
    completedRunIds.has(event.runId) ||
    (!!event.parentEventId && completedRunIds.has(event.parentEventId)) ||
    (!!event.correlationId && completedRunIds.has(event.correlationId))
  );
}

function belongsToRun(event: AnyAgentEvent, runId: string): boolean {
  const checkpointRunId = turnCompleteRunId(event);
  if (checkpointRunId) return checkpointRunId === runId;

  return (
    event.runId === runId ||
    event.parentEventId === runId ||
    event.correlationId === runId
  );
}

function findLastCompletedTurn(
  events: AnyAgentEvent[],
): LastCompletedTurn | null {
  const checkpoint = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === TURN_COMPLETE)
    .at(-1);

  if (!checkpoint) return null;

  const runId = turnCompleteRunId(checkpoint.event);
  if (!runId) return null;

  return {
    runId,
    checkpointIndex: checkpoint.index,
    eventCount: events.filter((event) => belongsToRun(event, runId)).length,
  };
}

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

  private async loadCompletedReplay(sessionId: string): Promise<AnyAgentEvent[]> {
    const all = await this.load(sessionId);
    const checkpoints = all.filter((event) => event.type === TURN_COMPLETE);

    if (checkpoints.length === 0) return sortEventsForReplay(all);

    const completedRunIds = new Set(
      checkpoints.map((event) => (event.data as { runId: string }).runId),
    );
    const completedEvents = all.filter((event) =>
      belongsToCompletedRun(event, completedRunIds),
    );

    return sortEventsForReplay(completedEvents);
  }

  append(sessionId: string, event: AnyAgentEvent): Promise<void> {
    return this.appendRecordedEvent(sessionId, event);
  }

  completeTurn(
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<void> {
    const checkpoint = makeEvent(runId, TURN_COMPLETE, { runId }, sequence);
    return this.appendRecordedEvent(sessionId, checkpoint);
  }

  async loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return this.loadCompletedReplay(sessionId);
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
    const latest = findLastCompletedTurn(events);

    if (!latest) {
      return { dropped: false, removedEvents: 0, reason: "no-completed-turn" };
    }

    if (expectedRunId && latest.runId !== expectedRunId) {
      return {
        dropped: false,
        runId: latest.runId,
        removedEvents: 0,
        reason: "latest-turn-mismatch",
      };
    }

    const remaining = events.filter(
      (event) => !belongsToRun(event, latest.runId),
    );
    await this.ensureDir();
    await writeFile(
      this.filePath(sessionId),
      remaining.map((event) => JSON.stringify(event)).join("\n") +
        (remaining.length > 0 ? "\n" : ""),
      "utf-8",
    );

    return {
      dropped: true,
      runId: latest.runId,
      removedEvents: events.length - remaining.length,
    };
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
