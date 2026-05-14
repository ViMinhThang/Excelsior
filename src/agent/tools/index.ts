import { createRunCommandTool } from "./runCommand/runCommand.js";
import { createWriteTool } from "./fs/write.js";
import { createEditTool } from "./fs/edit.js";
import { createLsTool } from "./fs/ls.js";
import { createViewTool } from "./fs/view.js";
import { createGlobTool } from "./fs/glob.js";
import { createGrepTool } from "./fs/grep.js";
import type { ToolContext } from "../../lib/tool/context.js";

export function createFileTools(ctx?: ToolContext) {
  return {
    runCommand: createRunCommandTool(ctx),
    ls: createLsTool(ctx),
    view: createViewTool(ctx),
    write: createWriteTool(ctx),
    edit: createEditTool(ctx),
    glob: createGlobTool(ctx),
    grep: createGrepTool(ctx),
  };
}
