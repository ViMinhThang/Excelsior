import { appendFile, mkdir, readFile, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { AnyAgentEvent } from "../runtime/events.js";
import { TURN_COMPLETE } from "../runtime/eventNames.js";

let sessionsDir = process.env.EXCELSIOR_SESSIONS_DIR ?? join(process.cwd(), "data", "sessions");

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
  await ensureDir();
  await appendFile(filePath(sessionId), JSON.stringify(event) + "\n");
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

export async function loadUntilLastCheckpoint(sessionId: string): Promise<CheckpointResult> {
  const all = await loadRawSessionEvents(sessionId);
  let lastCheckpointIndex = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].type === TURN_COMPLETE) {
      lastCheckpointIndex = i;
      break;
    }
  }
  if (lastCheckpointIndex < 0) {
    return { events: all, lastCheckpointIndex: -1, hasIncompleteRun: false };
  }
  return {
    events: all.slice(0, lastCheckpointIndex + 1),
    lastCheckpointIndex,
    hasIncompleteRun: lastCheckpointIndex < all.length - 1,
  };
}

export async function deleteSessionEvents(sessionId: string): Promise<void> {
  try {
    await unlink(filePath(sessionId));
  } catch {}
}

export async function deleteAllSessionsEvents(): Promise<void> {
  if (!existsSync(sessionsDir)) return;
  const files = await readdir(sessionsDir);
  await Promise.all(
    files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => unlink(join(sessionsDir, f)).catch(() => {})),
  );
}
