import type { ProjectedBlock } from "@excelsior/core";

export function selectToolBlocks(blocks: ProjectedBlock[]) {
  return blocks.filter((block) => block.type === "tool-call");
}
