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
import { AnyAgentEvent, makeEvent } from "../runtime/events.js";
import { TURN_COMPLETE } from "../runtime/eventNames.js";

let sessionsDir =
  process.env.EXCELSIOR_SESSIONS_DIR ?? join(process.cwd(), "data", "sessions");
const appendQueues = new Map<string, Promise<void>>();

export function setSessionsDirForTests(dir: string): void {
  sessionsDir = dir;
}

export function resetSessionsDirForTests(): void {
  sessionsDir =
    process.env.EXCELSIOR_SESSIONS_DIR ??
    join(process.cwd(), "data", "sessions");
}

export interface LastCompletedTurn {
  runId: string;
  eventCount: number;
  checkpointIndex: number;
}

export interface DropLastCompletedTurnResult {
  dropped: boolean;
  runId?: string;
  removedEvents: number;
  reason?: "no-completed-turn" | "latest-turn-mismatch";
}

export interface RunRecorder {
  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void>;
  recordTurnComplete(
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<void>;
  loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]>;
  getLastCompletedTurn(sessionId: string): Promise<LastCompletedTurn | null>;
  dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult>;
  deleteSessionEvents(sessionId: string): Promise<void>;
  deleteAllSessionEvents(): Promise<void>;
}

async function ensureDir(): Promise<void> {
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true });
  }
}

function filePath(sessionId: string): string {
  return join(sessionsDir, `${sessionId}.jsonl`);
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
    completedRunIds.has(event.correlationId)
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

async function waitForSessionQueue(sessionId: string): Promise<void> {
  await appendQueues.get(sessionId)?.catch(() => {});
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

async function appendRecordedEvent(
  sessionId: string,
  event: AnyAgentEvent,
): Promise<void> {
  const previous = appendQueues.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await ensureDir();
      await appendFile(filePath(sessionId), JSON.stringify(event) + "\n");
    });

  appendQueues.set(sessionId, next);

  try {
    await next;
  } finally {
    if (appendQueues.get(sessionId) === next) {
      appendQueues.delete(sessionId);
    }
  }
}

async function loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]> {
  const path = filePath(sessionId);
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

async function loadCompletedReplay(sessionId: string): Promise<AnyAgentEvent[]> {
  const all = await loadRawEvents(sessionId);
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

export class JsonlRunRecorder implements RunRecorder {
  recordEvent(sessionId: string, event: AnyAgentEvent): Promise<void> {
    return appendRecordedEvent(sessionId, event);
  }

  recordTurnComplete(
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<void> {
    const checkpoint = makeEvent(runId, TURN_COMPLETE, { runId }, sequence);
    return appendRecordedEvent(sessionId, checkpoint as AnyAgentEvent);
  }

  async loadCompletedEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return loadCompletedReplay(sessionId);
  }

  loadRawEvents(sessionId: string): Promise<AnyAgentEvent[]> {
    return loadRawEvents(sessionId);
  }

  async getLastCompletedTurn(
    sessionId: string,
  ): Promise<LastCompletedTurn | null> {
    await waitForSessionQueue(sessionId);
    return findLastCompletedTurn(await loadRawEvents(sessionId));
  }

  async dropLastCompletedTurn(
    sessionId: string,
    expectedRunId?: string,
  ): Promise<DropLastCompletedTurnResult> {
    await waitForSessionQueue(sessionId);
    const events = await loadRawEvents(sessionId);
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
    await ensureDir();
    await writeFile(
      filePath(sessionId),
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

  async deleteSessionEvents(sessionId: string): Promise<void> {
    await waitForSessionQueue(sessionId);
    try {
      await unlink(filePath(sessionId));
    } catch {}
  }

  async deleteAllSessionEvents(): Promise<void> {
    await Promise.all(
      [...appendQueues.values()].map((queue) => queue.catch(() => {})),
    );
    if (!existsSync(sessionsDir)) return;
    const files = await readdir(sessionsDir);
    await Promise.all(
      files
        .filter((file) => file.endsWith(".jsonl"))
        .map((file) => unlink(join(sessionsDir, file)).catch(() => {})),
    );
  }
}

export const defaultRunRecorder = new JsonlRunRecorder();
