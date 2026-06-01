import {
  parseFileChangePreview,
} from "./fileChangePreview.js";
import { stringifyToolArgValue } from "./toolArgs.js";
import type {
  ToolDisplayConfig,
  ToolFormatterContext,
} from "./types.js";

function formatFileChangeTool(
  label: "Write" | "Edit",
  { args, normalizedContent, tone, status }: ToolFormatterContext,
) {
  const filePath = stringifyToolArgValue(args?.filePath);
  if (status === "pending") {
    return {
      label,
      summary: filePath || "file",
      detail: "waiting for approval or execution",
      tone,
    };
  }
  const lines = normalizedContent.split(/\r?\n/).filter(Boolean);
  const successLine = lines[0] || "";
  const diffLines = lines.slice(1);
  const added = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const diffStats = added + removed > 0 ? ` (+${added} -${removed} lines)` : "";
  const fileChangePreview = diffLines.length > 0
    ? parseFileChangePreview({
      toolName: label.toLowerCase() as "write" | "edit",
      filePath,
      content: normalizedContent,
    })
    : undefined;
  return {
    label,
    summary: filePath || "file",
    detail: diffLines.length > 0
      ? `${filePath}${diffStats}`
      : successLine,
    resultPreview: diffLines.length > 0 && !fileChangePreview ? diffLines.slice(0, 10) : undefined,
    omittedResultLines: diffLines.length > 10 ? diffLines.length - 10 : undefined,
    fileChangePreview,
    showCompletion: false,
    tone,
  };
}

function formatFileChangeSummary(
  args: Record<string, unknown> | null,
  content: string,
): string | undefined {
  const trimmed = content.trim();
  const lines = trimmed.split("\n").filter(Boolean);
  const diffLines = lines.slice(1);
  const added = diffLines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diffLines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  if (added + removed > 0) {
    return `${stringifyToolArgValue(args?.filePath)} (+${added} -${removed} lines changed)`;
  }
  return lines[0] || "Completed";
}

function formatFileChangeCommand(
  action: "write" | "edit",
  args: Record<string, unknown> | null,
  filePath?: string,
): string {
  const target = filePath ?? stringifyToolArgValue(args?.filePath || args?.path);
  return target ? `${action} ${target}` : action;
}

export const writeDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => formatFileChangeCommand("write", args),
  formatSummaryLine: formatFileChangeSummary,
  formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
};

export const writeFileDisplayConfig: ToolDisplayConfig = {
  formatCommand: (
    args: Record<string, unknown> | null,
    _argsStr?: string,
    filePath?: string,
  ) => formatFileChangeCommand("write", args, filePath),
  formatSummaryLine: formatFileChangeSummary,
  formatter: (params: ToolFormatterContext) => formatFileChangeTool("Write", params),
};

export const editDisplayConfig: ToolDisplayConfig = {
  formatCommand: (args: Record<string, unknown> | null) => formatFileChangeCommand("edit", args),
  formatSummaryLine: formatFileChangeSummary,
  formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
};

export const editFileDisplayConfig: ToolDisplayConfig = {
  formatCommand: (
    args: Record<string, unknown> | null,
    _argsStr?: string,
    filePath?: string,
  ) => formatFileChangeCommand("edit", args, filePath),
  formatSummaryLine: formatFileChangeSummary,
  formatter: (params: ToolFormatterContext) => formatFileChangeTool("Edit", params),
};
