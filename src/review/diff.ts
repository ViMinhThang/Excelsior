import { collectWorkspaceFileSnapshot } from "../tools/read-file.js";
import type { ChangedFile, FileContext } from "./types.js";

export function extractChangedFiles(diff: string): ChangedFile[] {
  const changedFiles: ChangedFile[] = [];
  let currentFile: ChangedFile | null = null;
  let nextLineNumber = 0;

  const flushCurrentFile = () => {
    if (!currentFile) {
      return;
    }

    changedFiles.push(currentFile);
    currentFile = null;
  };

  for (const line of diff.split(/\r?\n/)) {
    const diffHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffHeader) {
      const filePath = diffHeader[2];
      if (!filePath) {
        continue;
      }
      flushCurrentFile();
      currentFile = {
        path: filePath,
        patch: line,
        addedLines: [],
        removedLines: [],
      };
      nextLineNumber = 0;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    currentFile.patch += `\n${line}`;

    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      nextLineNumber = Number(hunkHeader[1]);
      continue;
    }

    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+")) {
      currentFile.addedLines.push({
        number: nextLineNumber > 0 ? nextLineNumber : null,
        text: line.slice(1),
      });
      nextLineNumber += 1;
      continue;
    }

    if (line.startsWith("-")) {
      currentFile.removedLines.push({
        number: null,
        text: line.slice(1),
      });
      continue;
    }

    if (line.startsWith(" ")) {
      nextLineNumber += 1;
    }
  }

  flushCurrentFile();
  return changedFiles;
}

export async function collectWorkspaceContexts(
  workspaceRoot: string,
  changedFiles: ChangedFile[],
  maxFiles = 5,
  maxCharsPerFile = 4000,
): Promise<FileContext[]> {
  const contexts: FileContext[] = [];

  for (const file of changedFiles.slice(0, maxFiles)) {
    const snapshot = await collectWorkspaceFileSnapshot(workspaceRoot, file.path, maxCharsPerFile);
    if (!snapshot) {
      continue;
    }

    contexts.push({
      path: file.path,
      content: snapshot.content,
      truncated: snapshot.truncated,
    });
  }

  return contexts;
}
