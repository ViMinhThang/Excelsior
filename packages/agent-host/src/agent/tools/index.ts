import { createAskQuestionTool } from "./interaction/askQuestion.js";
import { createRunCommandTool } from "./system/runCommand.js";
import { createWriteTool } from "./fs/write.js";
import { createEditTool } from "./fs/edit.js";
import { createLsTool } from "./fs/ls.js";
import { createViewTool } from "./fs/view.js";
import { createGlobTool } from "./fs/glob.js";
import { createRipgrepTool } from "./fs/ripgrep.js";
import type { ToolContext } from "./core/context.js";

export function createFileTools(ctx?: ToolContext) {
  return {
    runCommand: createRunCommandTool(ctx),
    askQuestion: createAskQuestionTool(ctx),
    ls: createLsTool(ctx),
    view: createViewTool(ctx),
    write: createWriteTool(ctx),
    edit: createEditTool(ctx),
    glob: createGlobTool(ctx),
    ripgrep: createRipgrepTool(ctx),
  };
}
