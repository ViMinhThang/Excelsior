import type { ProjectedBlock } from "@excelsior/core";

export interface OptimisticTranscriptOptions {
  displayBlocks: ProjectedBlock[];
  optimisticUserMessage: string | null;
  now?: () => Date;
}

export function buildOptimisticTranscript({
  displayBlocks,
  optimisticUserMessage,
  now = () => new Date(),
}: OptimisticTranscriptOptions): ProjectedBlock[] {
  if (!optimisticUserMessage) return displayBlocks;
  if (hasUserMessage(displayBlocks, optimisticUserMessage)) return displayBlocks;

  const timestamp = now();
  return [
    ...displayBlocks,
    {
      type: "user",
      id: `optimistic_${timestamp.getTime()}`,
      content: optimisticUserMessage,
      timestamp: timestamp.toISOString(),
      isFrozen: true,
    },
  ];
}

export function shouldClearOptimisticMessage(
  displayBlocks: ProjectedBlock[],
  optimisticUserMessage: string | null,
): boolean {
  if (!optimisticUserMessage) return false;
  const latestUserBlock = displayBlocks.filter((block) => block.type === "user").at(-1);
  return latestUserBlock?.content === optimisticUserMessage;
}

function hasUserMessage(displayBlocks: ProjectedBlock[], content: string): boolean {
  return displayBlocks.some((block) => block.type === "user" && block.content === content);
}
