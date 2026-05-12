import { createRunCommandTool } from "./runCommand/runCommand.js";
import { createWriteTool } from "./fs/write.js";
import { createEditTool } from "./fs/edit.js";
import { lsTool } from "./fs/ls.js";
import { viewTool } from "./fs/view.js";
import { globTool } from "./fs/glob.js";
import { grepTool } from "./fs/grep.js";
import type { ToolContext } from "../../lib/tool/context.js";

export function createFileTools(ctx?: ToolContext) {
  return {
    runCommand: createRunCommandTool(ctx),
    ls: lsTool,
    view: viewTool,
    write: createWriteTool(ctx),
    edit: createEditTool(ctx),
    glob: globTool,
    grep: grepTool,
  };
}
