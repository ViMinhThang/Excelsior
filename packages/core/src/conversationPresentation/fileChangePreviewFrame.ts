import {
  COLLAPSED_VIEWPORT_HEIGHT,
  PENDING_VIEWPORT_HEIGHT,
} from "./fileChangePreviewConstants.js";
import type {
  FileChangePreviewFrame,
  FileChangePreviewFrameInput,
  FileChangeRow,
  InlineDiffRow,
} from "./types.js";

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
