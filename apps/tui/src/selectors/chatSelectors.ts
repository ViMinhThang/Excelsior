import type { ProjectedBlock } from "@excelsior/core";

export function selectSubAgentBlocks(
  blocks: ProjectedBlock[],
): (ProjectedBlock & { type: "sub-agent" })[] {
  return blocks.filter((b): b is ProjectedBlock & { type: "sub-agent" } => b.type === "sub-agent");
}
