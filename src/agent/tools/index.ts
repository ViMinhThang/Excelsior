import { readFileTool } from './readFile/readFile.js';
import { writeFileTool } from './writeFile/writeFile.js';
import { runCommandTool } from './runCommand/runCommand.js';
import { listFilesTool } from './listFiles/listFiles.js';

export const allTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  runCommand: runCommandTool,
  listFiles: listFilesTool,
};

// Re-export as fileTools for backward compatibility
export const fileTools = allTools;
