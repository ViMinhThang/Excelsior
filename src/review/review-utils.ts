import type { ChangedFile, FileContext } from "./types.js";

export function formatChangedFiles(changedFiles: ChangedFile[]): string {
  return changedFiles.map((file) => `### ${file.path}\n${file.patch}`).join("\n\n") || "(none)";
}

export function formatFileContexts(fileContexts: FileContext[]): string {
  return fileContexts
    .map((ctx) => `### ${ctx.path}${ctx.truncated ? " (truncated)" : ""}\n${ctx.content}`)
    .join("\n\n") || "(none)";
}
