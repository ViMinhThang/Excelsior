import { appendFile, mkdir, readFile, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { AnyAgentEvent } from "../runtime/events.js";
import { TURN_COMPLETE } from "../runtime/event-names.js";

const SESSIONS_DIR = join(process.cwd(), "data", "sessions");

async function ensureDir(): Promise<void> {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
  }
}

function filePath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.jsonl`);
}

export async function appendEvent(sessionId: string, event: AnyAgentEvent): Promise<void> {
  await ensureDir();
  await appendFile(filePath(sessionId), JSON.stringify(event) + "\n");
}

export async function loadSessionEvents(sessionId: string): Promise<AnyAgentEvent[]> {
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

export interface CheckpointResult {
  events: AnyAgentEvent[];
  lastCheckpointIndex: number;
  hasIncompleteRun: boolean;
}

export async function loadUntilLastCheckpoint(sessionId: string): Promise<CheckpointResult> {
  const all = await loadSessionEvents(sessionId);
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
  if (!existsSync(SESSIONS_DIR)) return;
  const files = await readdir(SESSIONS_DIR);
  await Promise.all(
    files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => unlink(join(SESSIONS_DIR, f)).catch(() => {})),
  );
}
