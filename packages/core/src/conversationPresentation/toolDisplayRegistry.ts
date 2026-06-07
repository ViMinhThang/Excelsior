import {
  editDisplayConfig,
  editFileDisplayConfig,
  writeDisplayConfig,
  writeFileDisplayConfig,
} from "./fileToolDisplays.js";
import {
  gitDiffDisplayConfig,
  spawnSubAgentDisplayConfig,
} from "./miscToolDisplays.js";
import {
  globDisplayConfig,
  lsDisplayConfig,
  viewDisplayConfig,
} from "./readToolDisplays.js";
import { runCommandDisplayConfig } from "./runCommandDisplay.js";
import type { ToolDisplayConfig } from "./types.js";

class ToolDisplayRegistry {
  private readonly configs = new Map<string, ToolDisplayConfig>();

  on(name: string, config: ToolDisplayConfig): this {
    this.configs.set(name, config);
    return this;
  }

  get(name: string): ToolDisplayConfig | undefined {
    return this.configs.get(name);
  }
}

export const toolDisplayRegistry = new ToolDisplayRegistry()
  .on("view", viewDisplayConfig)
  .on("ls", lsDisplayConfig)
  .on("glob", globDisplayConfig)
  .on("write", writeDisplayConfig)
  .on("writeFile", writeFileDisplayConfig)
  .on("edit", editDisplayConfig)
  .on("editFile", editFileDisplayConfig)
  .on("runCommand", runCommandDisplayConfig)
  .on("run_command", runCommandDisplayConfig)
  .on("spawnSubAgent", spawnSubAgentDisplayConfig)
  .on("browser_subagent", spawnSubAgentDisplayConfig)
  .on("gitDiff", gitDiffDisplayConfig);