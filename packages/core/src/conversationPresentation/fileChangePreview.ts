import type {
  FileChangeAction,
  FileChangePreview,
  FileChangePreviewFrame,
  FileChangePreviewFrameInput,
  FileChangePreviewNavigation,
  FileChangeRow,
  InlineDiffRow,
} from "./types.js";

const PENDING_VIEWPORT_HEIGHT = 12;
const COLLAPSED_VIEWPORT_HEIGHT = 10;

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

export function getFileChangePreviewNavigation(
  preview: FileChangePreview | null | undefined,
): FileChangePreviewNavigation {
  const totalRows = preview?.oldRows?.length ?? 0;
  const hunkIndices = preview?.hunkIndices ?? [];

  return {
    totalRows,
    hunkIndices,
    hunkCount: hunkIndices.length,
    maxScroll: Math.max(0, totalRows - PENDING_VIEWPORT_HEIGHT),
  };
}

export function getInlineRowsAndMap(
  oldRows: FileChangeRow[],
  newRows: FileChangeRow[],
): { rows: InlineDiffRow[]; parallelToInlineMap: number[] } {
  const result: InlineDiffRow[] = [];
  const deletions: { row: FileChangeRow; origIndex: number }[] = [];
  const additions: { row: FileChangeRow; origIndex: number }[] = [];
  const parallelToInlineMap: number[] = [];

  const flush = () => {
    for (const del of deletions) {
      parallelToInlineMap[del.origIndex] = result.length;
      result.push({
        marker: "-",
        text: del.row.text,
        tone: "removed",
        lineNumber: del.row.lineNumber,
      });
    }
    for (const add of additions) {
      parallelToInlineMap[add.origIndex] = result.length;
      result.push({
        marker: "+",
        text: add.row.text,
        tone: "added",
        lineNumber: add.row.lineNumber,
      });
    }
    deletions.length = 0;
    additions.length = 0;
  };

  const len = Math.max(oldRows.length, newRows.length);
  for (let i = 0; i < len; i++) {
    const oldRow = oldRows[i];
    const newRow = newRows[i];

    if (oldRow?.tone === "context" || newRow?.tone === "context") {
      flush();
      parallelToInlineMap[i] = result.length;
      const row = newRow?.tone === "context" ? newRow : oldRow;
      result.push({
        marker: " ",
        text: row.text,
        tone: "context",
        lineNumber: row.lineNumber,
      });
    } else {
      if (oldRow && oldRow.tone === "removed") {
        deletions.push({ row: oldRow, origIndex: i });
      }
      if (newRow && newRow.tone === "added") {
        additions.push({ row: newRow, origIndex: i });
      }
      if (!oldRow || oldRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
      if (!newRow || newRow.tone === "empty") {
        parallelToInlineMap[i] = result.length;
      }
    }
  }
  flush();

  let lastVal = 0;
  for (let i = 0; i < len; i++) {
    if (parallelToInlineMap[i] === undefined) {
      parallelToInlineMap[i] = lastVal;
    } else {
      lastVal = parallelToInlineMap[i];
    }
  }

  return { rows: result, parallelToInlineMap };
}

export function buildFileChangePreviewFrame({
  preview,
  terminalColumns,
  scrollOffset = 0,
  pending = false,
  focused = false,
}: FileChangePreviewFrameInput): FileChangePreviewFrame {
  const isWide = terminalColumns >= 120;
  const previewWidth = Math.max(80, terminalColumns - 6);
  const totalRows = preview.oldRows.length;
  const { rows: allInlineRows, parallelToInlineMap } = getInlineRowsAndMap(
    preview.oldRows,
    preview.newRows,
  );
  const totalInlineRows = allInlineRows.length;

  const viewportHeight = isWide
    ? (pending ? PENDING_VIEWPORT_HEIGHT : (focused ? totalRows : Math.min(COLLAPSED_VIEWPORT_HEIGHT, totalRows)))
    : (pending ? PENDING_VIEWPORT_HEIGHT : (focused ? totalInlineRows : Math.min(COLLAPSED_VIEWPORT_HEIGHT, totalInlineRows)));

  const isCapped =
    !pending &&
    !focused &&
    (isWide ? totalRows > COLLAPSED_VIEWPORT_HEIGHT : totalInlineRows > COLLAPSED_VIEWPORT_HEIGHT);

  let oldRows = preview.oldRows;
  let newRows = preview.newRows;
  let inlineRows: InlineDiffRow[] = [];
  let inlineStart = 0;

  if (isWide) {
    const start = pending ? Math.min(scrollOffset, Math.max(0, totalRows - viewportHeight)) : 0;
    oldRows = preview.oldRows.slice(start, start + viewportHeight);
    newRows = preview.newRows.slice(start, start + viewportHeight);
  } else {
    inlineStart = pending
      ? Math.min(
        parallelToInlineMap[scrollOffset] ?? 0,
        Math.max(0, totalInlineRows - viewportHeight),
      )
      : 0;
    inlineRows = allInlineRows.slice(inlineStart, inlineStart + viewportHeight);
  }

  const showScrollbar = pending && (isWide ? totalRows > viewportHeight : totalInlineRows > viewportHeight);
  const scrollbarInnerHeight = Math.max(0, viewportHeight - 2);

  let thumbPosition = 0;
  if (showScrollbar) {
    const totalScrollRange = isWide ? totalRows : totalInlineRows;
    const maxScrollPos = Math.max(1, totalScrollRange - viewportHeight);
    const currentScrollPos = isWide ? scrollOffset : inlineStart;
    const scrollRatio = Math.min(1, Math.max(0, currentScrollPos / maxScrollPos));
    thumbPosition = Math.min(
      scrollbarInnerHeight - 1,
      Math.round(scrollRatio * (scrollbarInnerHeight - 1)),
    );
  }

  return {
    isWide,
    previewWidth,
    oldRows,
    newRows,
    inlineRows,
    paneWidth: Math.max(36, Math.floor((previewWidth - (showScrollbar ? 4 : 1)) / 2)),
    totalRows,
    totalInlineRows,
    viewportHeight,
    isCapped,
    showScrollbar,
    scrollbarInnerHeight,
    thumbPosition,
  };
}
