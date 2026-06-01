import { PENDING_VIEWPORT_HEIGHT } from "./fileChangePreviewConstants.js";
import type {
  FileChangePreview,
  FileChangePreviewNavigation,
} from "./types.js";

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
