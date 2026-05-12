import { createRunCommandTool } from "./runCommand/runCommand.js";
import { createWriteTool } from "./fs/write.js";
import { createEditTool } from "./fs/edit.js";
import { lsTool } from "./fs/ls.js";
import { viewTool } from "./fs/view.js";
import { globTool } from "./fs/glob.js";
import { grepTool } from "./fs/grep.js";

interface ConfirmBus {
  getListenerCount(event: "request"): number;
  on(event: "response", handler: (resp: { callId: string; approved: boolean }) => void): () => void;
  emit(event: "request", data: { callId: string; toolName: string; args: string }): void;
}

export function createFileTools(confirmBus?: ConfirmBus) {
  return {
    runCommand: createRunCommandTool(confirmBus),
    ls: lsTool,
    view: viewTool,
    write: createWriteTool(confirmBus),
    edit: createEditTool(confirmBus),
    glob: globTool,
    grep: grepTool,
  };
}
