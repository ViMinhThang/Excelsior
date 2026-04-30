import { listFilesTool } from "./list-files/index.js";
import { readFileTool } from "./read-file/index.js";
import { searchFilesTool } from "./search-files/index.js";

export type ToolName = "list_files" | "read_file" | "search_files";

export function getTools(cwd: string, allowedTools?: string[]) {
  const tools = {
    list_files: listFilesTool(cwd),
    read_file: readFileTool(cwd),
    search_files: searchFilesTool(cwd),
  };

  if (allowedTools === undefined) {
    return tools;
  }

  const allowed = new Set(allowedTools);
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => allowed.has(name)),
  ) as Partial<typeof tools>;
}
