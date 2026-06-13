import { existsSync } from "node:fs";
import { join } from "node:path";

export function checkAgentsMetadataLoaded(rootPath: string): boolean {
  return existsSync(join(rootPath, "AGENTS.md"));
}
