import type { HarnessTool } from "../types.js";
import {
  createLsTool,
  createViewTool,
  createGlobTool,
  createRipgrepTool,
  createWriteTool,
  createEditTool,
} from "./fs.js";
import { createRunCommandTool } from "./system.js";
import { createAskQuestionTool } from "./interaction.js";
import { createSpawnSubAgentTool } from "./subAgent.js";

export {
  createLsTool,
  createViewTool,
  createGlobTool,
  createRipgrepTool,
  createWriteTool,
  createEditTool,
} from "./fs.js";
export { createRunCommandTool } from "./system.js";
export { createAskQuestionTool } from "./interaction.js";
export { createSpawnSubAgentTool } from "./subAgent.js";

export function createBuiltInTools(): HarnessTool[] {
  return [
    createLsTool(),
    createViewTool(),
    createGlobTool(),
    createRipgrepTool(),
    createWriteTool(),
    createWriteTool("write"),
    createEditTool(),
    createEditTool("edit"),
    createRunCommandTool(),
    createAskQuestionTool(),
    createSpawnSubAgentTool(),
  ];
}
