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

function splitFileLines(content: string): string[] {
  if (!content) return [];
  return content.split(/\r?\n/);
}

export function buildUnifiedFileDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): string | undefined {
  if (oldContent === newContent) return undefined;

  const oldLines = splitFileLines(oldContent);
  const newLines = splitFileLines(newContent);

  if (oldLines.length === 0) {
    return [
      `--- ${filePath}`,
      `+++ ${filePath}`,
      `@@ -1,0 +1,${newLines.length} @@`,
      ...newLines.map((line) => `+${line}`),
    ].join("\n");
  }

  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
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
  // Split the output content into individual lines
  const lines = content.split(/\r?\n/);
  
  // Find where the actual unified diff begins by looking for the '--- ' line
  const diffStart = lines.findIndex((line) => line.startsWith("--- "));
  if (diffStart === -1) return undefined;

  // Initialize arrays to store the final aligned rows for old (left) and new (right) views
  const oldRows: FileChangeRow[] = [];
  const newRows: FileChangeRow[] = [];
  
  // Buffers to hold consecutive removed/added lines before flushing/aligning them
  const oldBuffer: string[] = [];
  const newBuffer: string[] = [];
  
  // Keeps track of the current line numbers in the original and modified files
  const lineState = { oldLine: 1, newLine: 1 };
  
  // Stores the index in oldRows/newRows where each diff hunk starts
  const hunkIndices: number[] = [];
  
  let added = 0;
  let removed = 0;
  let sawHunk = false;

  // Process the diff content line by line, skipping '--- filename' and '+++ filename' headers
  for (const line of lines.slice(diffStart + 2)) {
    // 1. Check for hunk headers (e.g., '@@ -oldStart,oldLen +newStart,newLen @@')
    if (line.startsWith("@@")) {
      // Flush any accumulated changes in the buffers first
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      
      // Store the current row index as the start of a new hunk
      hunkIndices.push(oldRows.length);
      
      // Parse the starting line numbers for this hunk and update our line state trackers
      const starts = parseHunkStarts(line);
      if (starts) {
        lineState.oldLine = starts.oldLine;
        lineState.newLine = starts.newLine;
      }
      sawHunk = true;
      continue;
    }
    
    // Skip any content before we encounter the first hunk header
    if (!sawHunk) continue;
    
    // Ignore duplicate or misplaced header lines
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    // 2. Check for unchanged context lines (starts with a space ' ')
    if (line.startsWith(" ")) {
      // Flush any accumulated edits in the buffers before aligning the context row
      flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
      
      const text = stripDiffPrefix(line);
      
      // Push matching context row to both the old and new files at their current line numbers
      oldRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.oldLine });
      newRows.push({ marker: " ", text, tone: "context", lineNumber: lineState.newLine });
      
      lineState.oldLine++;
      lineState.newLine++;
      continue;
    }

    // 3. Check for removed lines (starts with '-')
    if (line.startsWith("-")) {
      oldBuffer.push(stripDiffPrefix(line));
      removed++;
      continue;
    }

    // 4. Check for added lines (starts with '+')
    if (line.startsWith("+")) {
      newBuffer.push(stripDiffPrefix(line));
      added++;
      continue;
    }

    // Flush changes if we hit an unrecognized line type
    flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);
  }

  // Ensure any trailing changes left in the buffers are flushed
  flushChangedRows(oldBuffer, newBuffer, oldRows, newRows, lineState);

  // Return undefined if no hunks were parsed or no modifications actually occurred
  if (!sawHunk || (added === 0 && removed === 0)) return undefined;

  return {
    filePath,
    // Infers action (e.g. 'edit', 'create', or 'overwrite' based on toolName and removals)
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

function getFileChangeToolName(toolName: string): "edit" | "write" | undefined {
  if (toolName === "edit" || toolName === "editFile") return "edit";
  if (toolName === "write" || toolName === "writeFile") return "write";
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
