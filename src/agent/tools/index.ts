import { readFileTool } from "./readFile/readFile.js";
import { writeFileTool } from "./writeFile/writeFile.js";
import { runCommandTool as baseRunCommandTool } from "./runCommand/runCommand.js";
import { listFilesTool } from "./listFiles/listFiles.js";
import { confirmBus, confirmable } from "./confirm.js";

const runCommandTool = confirmable(baseRunCommandTool, confirmBus);

export const allTools = {
  readFile: readFileTool,
  writeFile: confirmable(writeFileTool, confirmBus),
  runCommand: runCommandTool,
  listFiles: listFilesTool,
};

// Re-export as fileTools for backward compatibility
export const fileTools = allTools;
