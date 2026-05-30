import type { ProjectedBlock } from "@excelsior/core";

export function selectSubAgentBlocks(
  blocks: ProjectedBlock[],
): (ProjectedBlock & { type: "sub-agent" })[] {
  return blocks.filter((b): b is ProjectedBlock & { type: "sub-agent" } => b.type === "sub-agent");
}

export function selectUserBlocks(
  blocks: ProjectedBlock[],
): (ProjectedBlock & { type: "user" })[] {
  return blocks.filter((b): b is ProjectedBlock & { type: "user" } => b.type === "user");
}
