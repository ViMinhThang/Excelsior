import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";

export interface HistoryResetSnapshot {
  sessionId: string | null;
  staticBlockIds: string[];
}

export function createHistoryResetSnapshot(input: {
  sessionId: string | null;
  turns: readonly ProjectedTurn[];
}): HistoryResetSnapshot {
  const blocks = input.turns.flatMap((t) => t.blocks);
  return {
    sessionId: input.sessionId,
    staticBlockIds: getStaticHistoryBlockIds(blocks),
  };
}

export function getStaticHistoryBlockIds(
  blocks: readonly ProjectedBlock[],
): string[] {
  const lastUserIndex = findLastUserIndex(blocks);
  if (lastUserIndex < 0) return [];
  return blocks.slice(0, lastUserIndex).map((block) => block.id);
}

export function shouldResetHistory(
  previous: HistoryResetSnapshot,
  next: HistoryResetSnapshot,
): boolean {
  if (previous.sessionId !== next.sessionId) {
    return true;
  }
  return !isPrefix(previous.staticBlockIds, next.staticBlockIds);
}

function findLastUserIndex(blocks: readonly ProjectedBlock[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "user") return i;
  }
  return -1;
}

function isPrefix(previous: readonly string[], next: readonly string[]): boolean {
  if (previous.length > next.length) return false;
  return previous.every((id, index) => id === next[index]);
}
