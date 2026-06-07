import type {
  FileChangePreview,
  FileChangeRow,
} from "./types.js";

const PENDING_VIEWPORT_HEIGHT = 12;
const COLLAPSED_VIEWPORT_HEIGHT = 10;

export interface InlineDiffRow {
  marker: " " | "-" | "+";
  text: string;
  tone: "context" | "removed" | "added";
  lineNumber?: number;
}

export interface FileChangePreviewFrameInput {
  preview: FileChangePreview;
  terminalColumns: number;
  scrollOffset?: number;
  pending?: boolean;
  focused?: boolean;
  hideRemovedRows?: boolean;
}

export interface FileChangePreviewFrame {
  previewWidth: number;
  contentWidth: number;
  inlineRows: InlineDiffRow[];
  totalRows: number;
  totalInlineRows: number;
  viewportHeight: number;
  isCapped: boolean;
  showScrollbar: boolean;
  scrollbarInnerHeight: number;
  thumbPosition: number;
}

export interface FileChangePreviewNavigation {
  totalRows: number;
  hunkIndices: readonly number[];
  hunkCount: number;
  maxScroll: number;
}

function getInlineRowsAndMap(
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

function hideRemovedInlineRows(
  rows: InlineDiffRow[],
  parallelToInlineMap: number[],
): { rows: InlineDiffRow[]; parallelToInlineMap: number[] } {
  const visibleRows: InlineDiffRow[] = [];
  const originalToVisibleMap: number[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    originalToVisibleMap[index] = visibleRows.length;
    if (row.tone !== "removed") {
      visibleRows.push(row);
    }
  }

  return {
    rows: visibleRows,
    parallelToInlineMap: parallelToInlineMap.map((index) =>
      originalToVisibleMap[index] ?? visibleRows.length
    ),
  };
}

export function buildFileChangePreviewFrame({
  preview,
  terminalColumns,
  scrollOffset = 0,
  pending = false,
  focused = false,
  hideRemovedRows = false,
}: FileChangePreviewFrameInput): FileChangePreviewFrame {
  const previewWidth = Math.max(80, terminalColumns);
  const totalRows = preview.oldRows.length;
  const inlineResult = getInlineRowsAndMap(
    preview.oldRows,
    preview.newRows,
  );
  const { rows: allInlineRows, parallelToInlineMap } = hideRemovedRows
    ? hideRemovedInlineRows(inlineResult.rows, inlineResult.parallelToInlineMap)
    : inlineResult;
  const totalInlineRows = allInlineRows.length;

  const viewportHeight = pending
    ? PENDING_VIEWPORT_HEIGHT
    : focused
      ? totalInlineRows
      : Math.min(COLLAPSED_VIEWPORT_HEIGHT, totalInlineRows);

  const isCapped =
    !pending &&
    !focused &&
    totalInlineRows > COLLAPSED_VIEWPORT_HEIGHT;

  const inlineStart = pending
    ? Math.min(
      parallelToInlineMap[scrollOffset] ?? 0,
      Math.max(0, totalInlineRows - viewportHeight),
    )
    : 0;
  const inlineRows = allInlineRows.slice(inlineStart, inlineStart + viewportHeight);

  const showScrollbar = pending && totalInlineRows > viewportHeight;
  const scrollbarInnerHeight = Math.max(0, viewportHeight - 2);

  let thumbPosition = 0;
  if (showScrollbar) {
    const maxScrollPos = Math.max(1, totalInlineRows - viewportHeight);
    const scrollRatio = Math.min(1, Math.max(0, inlineStart / maxScrollPos));
    thumbPosition = Math.min(
      scrollbarInnerHeight - 1,
      Math.round(scrollRatio * (scrollbarInnerHeight - 1)),
    );
  }

  return {
    previewWidth,
    inlineRows,
    contentWidth: previewWidth - (showScrollbar ? 4 : 0),
    totalRows,
    totalInlineRows,
    viewportHeight,
    isCapped,
    showScrollbar,
    scrollbarInnerHeight,
    thumbPosition,
  };
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
