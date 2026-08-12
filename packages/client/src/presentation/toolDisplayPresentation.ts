import { normalizeToolText } from "./toolText.js";
import type {
  ToolDisplay,
  ToolDisplayBody,
  ToolDisplayPresentation,
  ToolStatus,
} from "./types.js";

function formatDiffStats(display: ToolDisplay): string | undefined {
  const preview = display.fileChangePreview;
  return preview ? `+${preview.added} -${preview.removed}` : undefined;
}

function buildBody(
  display: ToolDisplay,
  status: ToolStatus,
  content?: string,
): ToolDisplayBody {
  if (display.progressStats) {
    return { kind: "progressStats", stats: display.progressStats };
  }
  if (display.taskPreview) {
    return {
      kind: "taskPreview",
      tasks: display.taskPreview,
      completed: display.taskPreview.filter((task) => task.status === "done").length,
      total: display.taskPreview.length,
    };
  }
  if (display.isReadOnlyBrowse) {
    return display.summaryLine
      ? { kind: "summary", text: display.summaryLine }
      : { kind: "none" };
  }

  const detail = display.expandedDetail ?? display.detail;
  if (detail) return { kind: "detail", text: detail };

  if (display.resultPreview?.length) {
    return {
      kind: "preview",
      lines: display.resultPreview,
      omittedLines: display.omittedResultLines,
    };
  }

  if (!display.fileChangePreview) {
    const lines = normalizeToolText(content).split(/\r?\n/).filter(Boolean);
    if (lines.length > 0) return { kind: "preview", lines };
  }

  if (status === "completed" && display.showCompletion !== false) {
    return { kind: "completion", text: "Completed" };
  }

  return { kind: "none" };
}

export function createToolDisplayPresentation(input: {
  display: ToolDisplay;
  status: ToolStatus;
  content?: string;
}): ToolDisplayPresentation {
  const { display, status, content } = input;
  const hasFileChangePreview = Boolean(
    display.fileChangePreview && display.isFileAction && status === "completed",
  );
  const body = buildBody(display, status, content);
  const expandable = Boolean(
    hasFileChangePreview ||
    display.activityLabel ||
    body.kind !== "none",
  );

  return {
    expandable,
    hasFileChangePreview,
    diffStats: hasFileChangePreview ? formatDiffStats(display) : undefined,
    body,
  };
}
