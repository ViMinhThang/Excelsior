import { appendFile, mkdir, readFile, unlink, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { AnyAgentEvent } from "../runtime/events.js";
import { TURN_COMPLETE } from "../runtime/eventNames.js";

let sessionsDir = process.env.EXCELSIOR_SESSIONS_DIR ?? join(process.cwd(), "data", "sessions");
const appendQueues = new Map<string, Promise<void>>();

export function setSessionsDirForTests(dir: string): void {
  sessionsDir = dir;
}

export function resetSessionsDirForTests(): void {
  sessionsDir = process.env.EXCELSIOR_SESSIONS_DIR ?? join(process.cwd(), "data", "sessions");
}

async function ensureDir(): Promise<void> {
  if (!existsSync(sessionsDir)) {
    await mkdir(sessionsDir, { recursive: true });
  }
}

function filePath(sessionId: string): string {
  return join(sessionsDir, `${sessionId}.jsonl`);
}

export async function appendEvent(sessionId: string, event: AnyAgentEvent): Promise<void> {
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

export async function loadRawSessionEvents(sessionId: string): Promise<AnyAgentEvent[]> {
  const path = filePath(sessionId);
  try {
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as AnyAgentEvent);
  } catch {
    return [];
  }
}

export async function loadSessionEvents(sessionId: string): Promise<AnyAgentEvent[]> {
  return (await loadUntilLastCheckpoint(sessionId)).events;
}

export interface CheckpointResult {
  events: AnyAgentEvent[];
  lastCheckpointIndex: number;
  hasIncompleteRun: boolean;
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

function belongsToCompletedRun(event: AnyAgentEvent, completedRunIds: Set<string>): boolean {
  if (event.type === TURN_COMPLETE) {
    return completedRunIds.has((event.data as { runId: string }).runId);
  }

  return (
    completedRunIds.has(event.runId) ||
    (!!event.parentEventId && completedRunIds.has(event.parentEventId)) ||
    completedRunIds.has(event.correlationId)
  );
}

function turnCompleteRunId(event: AnyAgentEvent): string | null {
  if (event.type !== TURN_COMPLETE) return null;
  return (event.data as { runId?: string }).runId ?? null;
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

function findLastCompletedTurn(events: AnyAgentEvent[]): LastCompletedTurn | null {
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

export async function loadUntilLastCheckpoint(sessionId: string): Promise<CheckpointResult> {
  const all = await loadRawSessionEvents(sessionId);
  const checkpoints = all
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === TURN_COMPLETE);

  const lastCheckpointIndex = checkpoints.at(-1)?.index ?? -1;
  if (lastCheckpointIndex < 0) {
    return { events: sortEventsForReplay(all), lastCheckpointIndex: -1, hasIncompleteRun: false };
  }

  const completedRunIds = new Set(
    checkpoints.map(({ event }) => (event.data as { runId: string }).runId),
  );
  const completedEvents = all.filter((event) => belongsToCompletedRun(event, completedRunIds));

  return {
    events: sortEventsForReplay(completedEvents),
    lastCheckpointIndex,
    hasIncompleteRun: completedEvents.length < all.length,
  };
}

export async function getLastCompletedTurn(
  sessionId: string,
): Promise<LastCompletedTurn | null> {
  await waitForSessionQueue(sessionId);
  return findLastCompletedTurn(await loadRawSessionEvents(sessionId));
}

export async function dropLastCompletedTurn(
  sessionId: string,
  expectedRunId?: string,
): Promise<DropLastCompletedTurnResult> {
  await waitForSessionQueue(sessionId);
  const events = await loadRawSessionEvents(sessionId);
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

  const remaining = events.filter((event) => !belongsToRun(event, latest.runId));
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

export async function deleteSessionEvents(sessionId: string): Promise<void> {
  await waitForSessionQueue(sessionId);
  try {
    await unlink(filePath(sessionId));
  } catch {}
}

export async function deleteAllSessionsEvents(): Promise<void> {
  await Promise.all([...appendQueues.values()].map((queue) => queue.catch(() => {})));
  if (!existsSync(sessionsDir)) return;
  const files = await readdir(sessionsDir);
  await Promise.all(
    files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => unlink(join(sessionsDir, f)).catch(() => {})),
  );
}
