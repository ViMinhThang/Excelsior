import { listFilesTool } from "./list-files/index.js";
import { readFileTool } from "./read-file/index.js";
import { searchFilesTool } from "./search-files/index.js";

export function getTools(cwd: string) {
  return {
    list_files: listFilesTool(cwd),
    read_file: readFileTool(cwd),
    search_files: searchFilesTool(cwd),
  };
}
