import { readFileTool } from "./readFile/readFile.js";
import { writeFileTool } from "./writeFile/writeFile.js";
import { runCommandTool as baseRunCommandTool } from "./runCommand/runCommand.js";
import { listFilesTool } from "./listFiles/listFiles.js";
import { editFileTool } from "./editFile/editFile.js";
import { searchFilesTool } from "./searchFiles/searchFiles.js";
import { confirmBus, confirmable } from "./confirm.js";

const runCommandTool = confirmable(baseRunCommandTool, confirmBus);

export const allTools = {
  readFile: readFileTool,
  writeFile: confirmable(writeFileTool, confirmBus),
  editFile: confirmable(editFileTool, confirmBus),
  runCommand: runCommandTool,
  listFiles: listFilesTool,
  searchFiles: searchFilesTool,
};

// Re-export as fileTools for backward compatibility
export const fileTools = allTools;
