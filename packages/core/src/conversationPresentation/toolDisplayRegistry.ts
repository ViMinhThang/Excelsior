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
import { ToolDisplayRegistry } from "./toolDisplayRegistryCore.js";

export { ToolDisplayRegistry } from "./toolDisplayRegistryCore.js";

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
