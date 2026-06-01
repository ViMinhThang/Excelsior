import type {
  FileChangeAction,
  FileChangePreview,
  FileChangeRow,
} from "./types.js";

function stripDiffPrefix(line: string): string {
  return line.slice(1);
}

function flushChangedRows(
  oldBuffer: string[],
  newBuffer: string[],
  oldRows: FileChangeRow[],
  newRows: FileChangeRow[],
  lineState: { oldLine: number; newLine: number },
) {
  const rowCount = Math.max(oldBuffer.length, newBuffer.length);
  for (let index = 0; index < rowCount; index++) {
    if (oldBuffer[index] === undefined) {
      oldRows.push({ marker: " ", text: "", tone: "empty" });
    } else {
      oldRows.push({
        marker: "-",
        text: oldBuffer[index],
        tone: "removed",
        lineNumber: lineState.oldLine,
      });
      lineState.oldLine++;
    }

    if (newBuffer[index] === undefined) {
      newRows.push({ marker: " ", text: "", tone: "empty" });
    } else {
      newRows.push({
        marker: "+",
        text: newBuffer[index],
        tone: "added",
        lineNumber: lineState.newLine,
      });
      lineState.newLine++;
    }
  }
  oldBuffer.length = 0;
  newBuffer.length = 0;
}

function parseHunkStarts(line: string): { oldLine: number; newLine: number } | undefined {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (!match) return undefined;
  return {
    oldLine: Number(match[1]),
    newLine: Number(match[2]),
  };
}

function inferAction(toolName: string, removed: number): FileChangeAction {
  if (toolName === "edit") return "edit";
  return removed === 0 ? "create" : "overwrite";
}

export function parseFileChangePreview({
  toolName,
  filePath,
  content,
}: {
  toolName: "edit" | "write";
  filePath: string;
  content: string;
}): FileChangePreview | undefined {
  const lines = content.split(/\r?\n/);
  const diffStart = lines.findIndex((line) => line.startsWith("--- "));
  if (diffStart === -1) return undefined;

  const oldRows: FileChangeRow[] = [];
  const newRows: FileChangeRow[] = [];
  const oldBuffer: string[] = [];
  const newBuffer: string[] = [];
  const lineState = { oldLine: 1, newLine: 1 };
  const hunkIndices: number[] = [];
  let added = 0;
  let removed = 0;
  let sawHunk = false;

  for (const line of lines.slice(diffStart + 2)) {
    if (line.startsWith("@@")) {
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      hunkIndices.push(oldRows.length);
      const starts = parseHunkStarts(line);
      if (starts) {
        lineState.oldLine = starts.oldLine;
        lineState.newLine = starts.newLine;
      }
      sawHunk = true;
      continue;
    }
    if (!sawHunk) continue;
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    if (line.startsWith(" ")) {
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      const text = stripDiffPrefix(line);
      oldRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.oldLine });
      newRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.newLine });
      lineState.oldLine++;
      lineState.newLine++;
      continue;
    }

    if (line.startsWith("-")) {
      oldBuffer.push(stripDiffPrefix(line));
      removed++;
      continue;
    }

    if (line.startsWith("+")) {
      newBuffer.push(stripDiffPrefix(line));
      added++;
      continue;
    }

    flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
  }

  flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);

  if (!sawHunk || (added === 0 && removed === 0)) return undefined;

  return {
    filePath,
    action: inferAction(toolName, removed),
    oldTitle: "old",
    newTitle: "new",
    oldRows,
    newRows,
    oldLines: oldRows.map((row) => row.text),
    newLines: newRows.map((row) => row.text),
    added,
    removed,
    omittedRows: 0,
    hunkIndices,
  };
}

export function getFileChangeToolName(toolName: string): "edit" | "write" | undefined {
  if (toolName === "editFile") return "edit";
  if (toolName === "writeFile") return "write";
  return undefined;
}

export function parsePendingFileChangePreview({
  toolName,
  filePath,
  diff,
}: {
  toolName: string;
  filePath?: string;
  diff?: string;
}): FileChangePreview | undefined {
  const previewToolName = getFileChangeToolName(toolName);
  if (!previewToolName || !diff) return undefined;
  return parseFileChangePreview({
    toolName: previewToolName,
    filePath: filePath || "",
    content: `Pending changes\n${diff}`,
  });
}
