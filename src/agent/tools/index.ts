import { runCommandTool } from "./runCommand/runCommand.js";
import { lsTool } from "./fs/ls.js";
import { viewTool } from "./fs/view.js";
import { writeTool } from "./fs/write.js";
import { editTool } from "./fs/edit.js";
import { globTool } from "./fs/glob.js";
import { grepTool } from "./fs/grep.js";

export const fileTools = {
  runCommand: runCommandTool,
  ls: lsTool,
  view: viewTool,
  write: writeTool,
  edit: editTool,
  glob: globTool,
  grep: grepTool,
};
