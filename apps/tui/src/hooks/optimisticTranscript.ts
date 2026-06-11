import type { ProjectedBlock, ProjectedTurn } from "@excelsior/core";

export interface OptimisticTranscriptOptions {
  turns: ProjectedTurn[];
  optimisticUserMessage: string | null;
  now?: () => Date;
}

export function buildOptimisticTranscript({
  turns,
  optimisticUserMessage,
  now = () => new Date(),
}: OptimisticTranscriptOptions): ProjectedTurn[] {
  if (!optimisticUserMessage) return turns;
  if (hasUserMessage(turns, optimisticUserMessage)) return turns;

  const timestamp = now();
  const optimisticTurn: ProjectedTurn = {
    id: `optimistic_turn_${timestamp.getTime()}`,
    status: "in-progress",
    blocks: [
      {
        type: "user",
        id: `optimistic_${timestamp.getTime()}`,
        content: optimisticUserMessage,
        timestamp: timestamp.toISOString(),
        isFrozen: true,
      },
    ],
    startTime: timestamp.toISOString(),
  };

  return [...turns, optimisticTurn];
}

export function shouldClearOptimisticMessage(
  turns: ProjectedTurn[],
  optimisticUserMessage: string | null,
): boolean {
  if (!optimisticUserMessage) return false;
  const allBlocks = turns.flatMap((t) => t.blocks);
  const latestUserBlock = allBlocks.filter((block) => block.type === "user").at(-1);
  return latestUserBlock?.content === optimisticUserMessage;
}

function hasUserMessage(turns: ProjectedTurn[], content: string): boolean {
  return turns.some((turn) =>
    turn.blocks.some((block) => block.type === "user" && block.content === content)
  );
}
